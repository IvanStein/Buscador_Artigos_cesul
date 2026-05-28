import { defineConfig } from 'vite';
import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';

let mcpProcess: ChildProcessWithoutNullStreams | null = null;
let currentRequestId = 1;
const pendingRequests = new Map<number, { resolve: (data: any) => void, reject: (err: any) => void }>();
let responseBuffer = '';

let initPromise: Promise<void> | null = null;

function initMcp(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve, reject) => {
    console.log('[API Proxy] Starting notebooklm-mcp subprocess...');
    mcpProcess = spawn('notebooklm-mcp', [], {
      env: { ...process.env, NOTEBOOKLM_QUERY_TIMEOUT: '180' },
      shell: true
    });

    mcpProcess.stdout.on('data', (data) => {
      responseBuffer += data.toString();
      let lineEnd = responseBuffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = responseBuffer.substring(0, lineEnd).trim();
        responseBuffer = responseBuffer.substring(lineEnd + 1);
        if (line) {
          try {
            const message = JSON.parse(line);
            if (message.id !== undefined) {
              const callbacks = pendingRequests.get(message.id);
              if (callbacks) {
                pendingRequests.delete(message.id);
                if (message.error) {
                  callbacks.reject(message.error);
                } else {
                  callbacks.resolve(message.result);
                }
              }
            }
          } catch (e) {
            console.error('Failed to parse MCP response line:', line, e);
          }
        }
        lineEnd = responseBuffer.indexOf('\n');
      }
    });

    mcpProcess.stderr.on('data', (data) => {
      console.error('[notebooklm-mcp stderr]:', data.toString());
    });

    mcpProcess.on('close', (code) => {
      console.log(`[API Proxy] notebooklm-mcp process closed with code ${code}`);
      mcpProcess = null;
      initPromise = null;
      for (const [_, callbacks] of pendingRequests.entries()) {
        callbacks.reject(new Error('MCP process terminated unexpectedly.'));
      }
      pendingRequests.clear();
    });

    // Start initialization handshake
    const initId = 0;
    pendingRequests.set(initId, {
      resolve: (_result) => {
        try {
          const notification = JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized'
          }) + '\n';
          mcpProcess!.stdin.write(notification);
          console.log('[API Proxy] MCP Handshake successful!');
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      reject: (err) => {
        reject(new Error(`Initialization failed: ${JSON.stringify(err)}`));
      }
    });

    const initPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'vite-mcp-client',
          version: '1.0.0'
        }
      }
    }) + '\n';
    mcpProcess.stdin.write(initPayload);
  });

  return initPromise;
}

async function callMcpTool(name: string, args: any = {}) {
  await initMcp();
  return new Promise((resolve, reject) => {
    const id = currentRequestId++;
    pendingRequests.set(id, { resolve, reject });
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    }) + '\n';
    mcpProcess!.stdin.write(payload);
  });
}

export default defineConfig({
  server: {
    port: 5173
  },
  plugins: [
    {
      name: 'mcp-proxy-plugin',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/mcp')) {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk.toString();
              });
              req.on('end', async () => {
                try {
                  const { tool, arguments: toolArgs } = JSON.parse(body);
                  if (!tool) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Missing tool parameter' }));
                    return;
                  }
                  const result = await callMcpTool(tool, toolArgs);
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(result));
                } catch (error: any) {
                  console.error('[API Proxy] Error calling tool:', error);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: error.message || String(error) }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          } else {
            next();
          }
        });
      }
    }
  ]
});
