// src/main.ts

// Application State
let activeNotebookId = '';
let activeNotebookName = '';
let isAuthOnline = false;
let pollingIntervalId: any = null;

// Terminal Log Helper
function logToTerminal(message: string, isError = false) {
  const terminal = document.getElementById('terminalLogs');
  if (terminal) {
    const timestamp = new Date().toLocaleTimeString();
    const style = isError ? 'color: #f87171;' : '';
    terminal.innerHTML += `\n<span style="${style}">[${timestamp}] ${message}</span>`;
    terminal.scrollTop = terminal.scrollHeight;
  }
  console.log(`[Proxy Log] ${message}`);
}

// API proxy client wrapper
async function callMcp(tool: string, args: any = {}): Promise<any> {
  logToTerminal(`Chamando MCP tool: ${tool}...`);
  try {
    const response = await fetch('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tool, arguments: args })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `Erro HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    // Standard MCP tools wrap response in a content array
    if (data && data.content && data.content[0] && data.content[0].text) {
      const txt = data.content[0].text;
      try {
        const parsed = JSON.parse(txt);
        logToTerminal(`Sucesso: ${tool}`);
        return parsed;
      } catch {
        logToTerminal(`Sucesso: ${tool}`);
        return txt;
      }
    }
    
    logToTerminal(`Sucesso: ${tool}`);
    return data;
  } catch (error: any) {
    logToTerminal(`Falha em ${tool}: ${error.message}`, true);
    throw error;
  }
}

// Init Auth status check
async function checkAuthStatus() {
  const badge = document.getElementById('authBadge');
  const dot = badge?.querySelector('.status-dot');
  const text = document.getElementById('authStatusText');
  const detailText = document.getElementById('authStatusTextDetail');

  try {
    // Check if we can run notebook_list to verify active authentication
    const result = await callMcp('notebook_list', {});
    isAuthOnline = true;
    
    if (dot && text && detailText) {
      dot.className = 'status-dot online';
      text.innerText = 'Autenticado';
      detailText.innerText = 'Conectado (Google Account)';
      detailText.className = 'status-label online';
    }
    return result;
  } catch (e: any) {
    isAuthOnline = false;
    if (dot && text && detailText) {
      dot.className = 'status-dot offline';
      text.innerText = 'Não autenticado';
      detailText.innerText = 'Desconectado / Necessita login';
      detailText.className = 'status-label offline';
    }
  }
}

// Load Notebooks into selection list
async function loadNotebooks() {
  const listEl = document.getElementById('notebookList');
  if (!listEl) return;

  listEl.innerHTML = '<li class="notebook-empty">Carregando notebooks...</li>';

  try {
    const list = await callMcp('notebook_list', {});
    listEl.innerHTML = '';
    
    let notebooks: any[] = [];
    if (list && Array.isArray(list)) {
      notebooks = list;
    } else if (list && list.notebooks && Array.isArray(list.notebooks)) {
      notebooks = list.notebooks;
    }

    if (notebooks.length === 0) {
      listEl.innerHTML = '<li class="notebook-empty">Nenhum notebook encontrado. Crie um!</li>';
      return;
    }

    notebooks.forEach((nb: any) => {
      const id = nb.id || nb.notebookId;
      const title = nb.name || nb.title || 'Notebook sem nome';
      const sourceCount = nb.source_count !== undefined ? nb.source_count : 0;

      const li = document.createElement('li');
      li.className = 'notebook-item';
      if (id === activeNotebookId) {
        li.classList.add('active');
      }

      li.onclick = () => {
        selectNotebook(id, title);
      };

      const titleSpan = document.createElement('span');
      titleSpan.className = 'notebook-item-title';
      titleSpan.textContent = title;
      if (sourceCount > 0) {
        titleSpan.textContent += ` (${sourceCount})`;
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'notebook-item-actions';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'notebook-action-btn';
      renameBtn.innerHTML = '✏️';
      renameBtn.title = 'Renomear';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        renameNotebook(id, title);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'notebook-action-btn danger';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Deletar';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteNotebook(id, title);
      };

      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);
      li.appendChild(titleSpan);
      li.appendChild(actionsDiv);
      listEl.appendChild(li);
    });
  } catch (e) {
    listEl.innerHTML = '<li class="notebook-empty" style="color:var(--danger)">Não foi possível carregar notebooks.</li>';
    logToTerminal('Não foi possível obter a lista de notebooks.', true);
  }
}

// Select active notebook
function selectNotebook(id: string, name: string) {
  activeNotebookId = id;
  activeNotebookName = name;
  logToTerminal(`Notebook ativo alterado para: ${name} (${id})`);

  // Update active state in UI list
  document.querySelectorAll('.notebook-item').forEach((item: any) => {
    const titleSpan = item.querySelector('.notebook-item-title');
    if (titleSpan && titleSpan.textContent.startsWith(name)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Clear chat context
  const messagesEl = document.getElementById('chatMessages');
  if (messagesEl) {
    messagesEl.innerHTML = `
      <div class="message system">
        <div class="message-content">
          Você entrou no notebook: <b>${name}</b>. Faça suas perguntas abaixo!
        </div>
      </div>
    `;
  }

  loadSources();
}

// Rename notebook helper
async function renameNotebook(id: string, currentTitle: string) {
  const newName = prompt('Digite o novo nome para o notebook:', currentTitle);
  if (newName && newName.trim()) {
    try {
      await callMcp('notebook_rename', {
        notebook_id: id,
        new_title: newName.trim()
      });
      logToTerminal(`Notebook renomeado para "${newName.trim()}"`);
      if (activeNotebookId === id) {
        activeNotebookName = newName.trim();
      }
      await loadNotebooks();
    } catch (e: any) {
      alert(`Falha ao renomear: ${e.message}`);
    }
  }
}

// Delete notebook helper
async function deleteNotebook(id: string, currentTitle: string) {
  if (confirm(`Tem certeza absoluta de que deseja excluir o notebook "${currentTitle}"? Esta ação não pode ser desfeita.`)) {
    try {
      await callMcp('notebook_delete', {
        notebook_id: id,
        confirm: true
      });
      logToTerminal(`Notebook "${currentTitle}" deletado.`);
      if (activeNotebookId === id) {
        activeNotebookId = '';
      }
      await loadNotebooks();
      await loadSources();
    } catch (e: any) {
      alert(`Falha ao deletar: ${e.message}`);
    }
  }
}

// Load Sources for selected Notebook
async function loadSources() {
  const listEl = document.getElementById('sourceList');
  const actionsEl = document.getElementById('sourceActions');
  const chatBtn = document.getElementById('btnSendChat') as HTMLButtonElement;
  
  if (!listEl) return;

  if (!activeNotebookId) {
    listEl.innerHTML = '<li class="source-empty">Nenhum notebook selecionado</li>';
    if (actionsEl) actionsEl.style.display = 'none';
    if (chatBtn) chatBtn.disabled = true;
    return;
  }

  if (actionsEl) actionsEl.style.display = 'flex';
  if (chatBtn) chatBtn.disabled = false;

  listEl.innerHTML = '<li class="source-empty">Carregando fontes...</li>';

  try {
    const details = await callMcp('notebook_get', { notebook_id: activeNotebookId });
    listEl.innerHTML = '';

    const sources = details?.sources || details?.notebook?.sources || [];
    
    if (sources.length === 0) {
      listEl.innerHTML = '<li class="source-empty">Sem fontes adicionadas. Use os botões acima para incluir textos ou links.</li>';
      return;
    }

    sources.forEach((src: any) => {
      const li = document.createElement('li');
      li.className = 'source-item';
      
      const info = document.createElement('div');
      info.className = 'source-info';
      info.onclick = () => viewSource(src.id);

      const name = document.createElement('span');
      name.className = 'source-name';
      name.textContent = src.name || src.title || 'Fonte sem nome';

      const type = document.createElement('span');
      type.className = 'source-type';
      type.textContent = src.type || 'Documento';

      info.appendChild(name);
      info.appendChild(type);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'source-delete-btn';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.title = 'Deletar fonte';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteSource(src.id, src.name || src.title);
      };

      li.appendChild(info);
      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });
  } catch (e: any) {
    listEl.innerHTML = `<li class="source-empty" style="color:var(--danger)">Erro: ${e.message}</li>`;
  }
}

// View Source Modal Content
async function viewSource(sourceId: string) {
  const modal = document.getElementById('sourceViewModal');
  const title = document.getElementById('sourceViewTitle');
  const body = document.getElementById('sourceViewBody');

  if (!modal || !title || !body) return;

  modal.style.display = 'flex';
  body.innerText = 'Carregando conteúdo da fonte...';

  try {
    const res = await callMcp('source_get_content', {
      notebook_id: activeNotebookId,
      source_id: sourceId
    });
    
    title.innerText = res.name || res.title || 'Visualizar Fonte';
    body.innerText = res.content || res.text || 'Sem conteúdo disponível para exibição.';
  } catch (e: any) {
    body.innerText = `Erro ao carregar conteúdo: ${e.message}`;
  }
}

// Delete Source
async function deleteSource(sourceId: string, sourceName: string) {
  if (confirm(`Deseja excluir a fonte "${sourceName}"?`)) {
    try {
      await callMcp('source_delete', {
        notebook_id: activeNotebookId,
        source_id: sourceId,
        confirm: true
      });
      logToTerminal(`Fonte "${sourceName}" excluída.`);
      loadSources();
    } catch (e: any) {
      alert(`Falha ao excluir fonte: ${e.message}`);
    }
  }
}

// UI Tabs Handler
document.querySelectorAll('.nav-tab').forEach((tab: any) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const target = tab.getAttribute('data-tab');
    const el = document.getElementById(target);
    if (el) el.classList.add('active');
  });
});

// Modals Trigger Handlers
const setupModal = (triggerId: string, modalId: string, cancelId: string, onSave: () => Promise<void>) => {
  const trigger = document.getElementById(triggerId);
  const modal = document.getElementById(modalId);
  const cancel = document.getElementById(cancelId);
  const save = modal?.querySelector('.btn-primary');

  if (!modal) return;

  trigger?.addEventListener('click', () => {
    modal.style.display = 'flex';
  });

  const close = () => {
    modal.style.display = 'none';
    const inputs = modal.querySelectorAll('input, textarea');
    inputs.forEach((i: any) => i.value = '');
  };

  cancel?.addEventListener('click', close);

  save?.addEventListener('click', async () => {
    try {
      await onSave();
      close();
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    }
  });
};

// Create Notebook modal trigger
setupModal('btnCreateNotebook', 'notebookModal', 'btnNotebookModalCancel', async () => {
  const input = document.getElementById('notebookModalInput') as HTMLInputElement;
  if (!input.value.trim()) throw new Error('Nome do notebook não pode ser vazio.');
  
  const res = await callMcp('notebook_create', { title: input.value.trim() });
  const newId = res.id || res.notebookId;
  logToTerminal(`Notebook criado: "${input.value.trim()}" (ID: ${newId})`);
  activeNotebookId = newId;
  await loadNotebooks();
  await loadSources();
});

// Source Modals
setupModal('btnAddTextSource', 'sourceTextModal', 'btnSourceTextCancel', async () => {
  const title = document.getElementById('sourceTextTitle') as HTMLInputElement;
  const content = document.getElementById('sourceTextContent') as HTMLTextAreaElement;

  if (!title.value.trim() || !content.value.trim()) {
    throw new Error('Preencha o título e conteúdo do texto.');
  }

  await callMcp('notebook_add_text', {
    notebook_id: activeNotebookId,
    title: title.value.trim(),
    text: content.value.trim()
  });

  logToTerminal(`Fonte de texto "${title.value.trim()}" adicionada.`);
  await loadSources();
});

setupModal('btnAddUrlSource', 'sourceUrlModal', 'btnSourceUrlCancel', async () => {
  const urlInput = document.getElementById('sourceUrlInput') as HTMLInputElement;
  if (!urlInput.value.trim()) throw new Error('Insira uma URL válida.');

  await callMcp('notebook_add_url', {
    notebook_id: activeNotebookId,
    url: urlInput.value.trim()
  });

  logToTerminal(`Fonte de URL "${urlInput.value.trim()}" adicionada.`);
  await loadSources();
});

// View Source Modal Close
document.getElementById('btnSourceViewClose')?.addEventListener('click', () => {
  const modal = document.getElementById('sourceViewModal');
  if (modal) modal.style.display = 'none';
});

// Chat Send Message
const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
const btnSendChat = document.getElementById('btnSendChat');

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !activeNotebookId) return;

  chatInput.value = '';
  
  // Render user message on screen
  appendChatMessage('user', text);
  
  const instructionEl = document.getElementById('chatInstruction') as HTMLInputElement;
  const instruction = instructionEl?.value.trim() || undefined;

  // Add a temporary typing bubble
  const typingId = appendChatMessage('assistant', 'Pensando...');

  try {
    const res = await callMcp('notebook_query', {
      notebook_id: activeNotebookId,
      query: text,
      instruction: instruction
    });

    // Remove typing bubble
    const typingBubble = document.getElementById(typingId);
    typingBubble?.remove();

    // Render response
    const answer = res.response || res.answer || res.text || String(res);
    const citations = res.citations || [];
    appendChatMessage('assistant', answer, citations);
  } catch (e: any) {
    const typingBubble = document.getElementById(typingId);
    typingBubble?.remove();
    appendChatMessage('system', `Erro ao consultar o notebook: ${e.message}`);
  }
}

btnSendChat?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Chat message append helper
let msgCounter = 0;
function appendChatMessage(role: 'user' | 'assistant' | 'system', text: string, citations?: any[]): string {
  const container = document.getElementById('chatMessages');
  if (!container) return '';

  const id = `msg-${msgCounter++}`;
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  wrapper.id = id;

  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerText = text;

  if (citations && citations.length > 0) {
    const citationsContainer = document.createElement('div');
    citationsContainer.className = 'citations-list';
    
    citations.forEach((cit: any, i: number) => {
      const tag = document.createElement('span');
      tag.className = 'citation-tag';
      tag.textContent = `[${i + 1}] ${cit.sourceName || cit.title || 'Citação'}`;
      tag.title = cit.text || 'Clique para visualizar';
      tag.onclick = () => {
        alert(`Citação de ${cit.sourceName || 'Fonte'}:\n\n"${cit.text || cit.snippet}"`);
      };
      citationsContainer.appendChild(tag);
    });

    content.appendChild(citationsContainer);
  }

  wrapper.appendChild(content);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return id;
}

// Studio Generator Triggers
document.querySelectorAll('.btn-studio-action').forEach((btn: any) => {
  btn.addEventListener('click', async () => {
    if (!activeNotebookId) {
      alert('Por favor, selecione um notebook no menu lateral antes de gerar materiais no Estúdio.');
      return;
    }

    const type = btn.getAttribute('data-type');
    const panel = document.getElementById('studioStatusPanel');
    const progressText = document.getElementById('studioProgressText');
    const details = document.getElementById('studioDetails');
    const deleteBtn = document.getElementById('btnDeleteStudioAsset');

    if (!panel || !progressText || !details) return;

    panel.style.display = 'flex';
    progressText.innerText = 'Enviando comando para o estúdio...';
    details.innerText = 'Inicializando...';
    if (deleteBtn) deleteBtn.style.display = 'none';

    let toolName = '';
    switch (type) {
      case 'audio': toolName = 'audio_overview_create'; break;
      case 'video': toolName = 'video_overview_create'; break;
      case 'slides': toolName = 'slide_deck_create'; break;
      case 'quiz': toolName = 'quiz_create'; break;
      case 'infographic': toolName = 'infographic_create'; break;
      case 'report': toolName = 'report_create'; break;
      case 'flashcards': toolName = 'flashcards_create'; break;
      case 'datatable': toolName = 'data_table_create'; break;
      case 'mindmap': toolName = 'mind_map_create'; break;
    }

    try {
      const initRes = await callMcp(toolName, { notebook_id: activeNotebookId, confirm: true });
      details.innerText = `Processo inicializado com sucesso.\nStatus: ${initRes.status || 'Pendente'}\nIniciando monitoramento...`;
      
      // Start polling
      startStudioPolling(activeNotebookId);
    } catch (e: any) {
      progressText.innerText = 'Falha na geração';
      details.innerText = `Erro: ${e.message}`;
    }
  });
});

// Polling Studio Status
function startStudioPolling(notebookId: string) {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  const progressText = document.getElementById('studioProgressText');
  const details = document.getElementById('studioDetails');
  const deleteBtn = document.getElementById('btnDeleteStudioAsset');

  pollingIntervalId = setInterval(async () => {
    try {
      const statusRes = await callMcp('studio_status', { notebook_id: notebookId });
      
      if (progressText && details) {
        progressText.innerText = `Gerando materiais...`;
        
        let displayStr = '';
        if (statusRes.assets && Array.isArray(statusRes.assets)) {
          statusRes.assets.forEach((asset: any) => {
            displayStr += `Asset: ${asset.type || 'Mídia'}\nStatus: ${asset.status || 'N/A'}\nURI: ${asset.uri || 'Gerando...'}\n\n`;
          });
        } else {
          displayStr = JSON.stringify(statusRes, null, 2);
        }
        
        details.innerText = displayStr;

        // Check if finished
        const assets = statusRes.assets || [];
        const activeCount = assets.filter((a: any) => a.status === 'PROCESSING' || a.status === 'PENDING').length;
        
        if (assets.length > 0 && activeCount === 0) {
          progressText.innerText = 'Processamento concluído!';
          clearInterval(pollingIntervalId);
          pollingIntervalId = null;
          
          if (deleteBtn) {
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = async () => {
              if (confirm('Tem certeza de que deseja excluir os assets gerados no estúdio para este notebook?')) {
                try {
                  await callMcp('studio_delete', { notebook_id: notebookId });
                  logToTerminal('Estúdio limpo.');
                  details.innerText = 'Nenhum material ativo.';
                  deleteBtn.style.display = 'none';
                } catch (err: any) {
                  alert(`Erro ao deletar: ${err.message}`);
                }
              }
            };
          }
        }
      }
    } catch (e: any) {
      if (progressText && details) {
        progressText.innerText = 'Erro ao verificar progresso';
        details.innerText = `Falha na verificação periódica: ${e.message}`;
      }
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }
  }, 5000);
}

// Studio status modal close
document.getElementById('btnCloseStudioStatus')?.addEventListener('click', () => {
  const panel = document.getElementById('studioStatusPanel');
  if (panel) panel.style.display = 'none';
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
});

// Config tab refresh auth button
document.getElementById('btnRefreshAuth')?.addEventListener('click', async () => {
  logToTerminal('Iniciando refresh de autenticação via MCP...');
  const btn = document.getElementById('btnRefreshAuth') as HTMLButtonElement;
  if (btn) btn.disabled = true;

  try {
    const res = await callMcp('refresh_auth', {});
    logToTerminal(`Refresh executado. Resposta: ${JSON.stringify(res)}`);
    await checkAuthStatus();
    await loadNotebooks();
  } catch (e: any) {
    alert(`Erro ao atualizar auth: ${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Manual Tokens Modal setup
const manualTokensModal = document.getElementById('manualTokensModal');
document.getElementById('btnManualTokens')?.addEventListener('click', () => {
  if (manualTokensModal) manualTokensModal.style.display = 'flex';
});

document.getElementById('btnManualTokensCancel')?.addEventListener('click', () => {
  if (manualTokensModal) manualTokensModal.style.display = 'none';
});

document.getElementById('btnManualTokensSave')?.addEventListener('click', async () => {
  const sapisid = (document.getElementById('authSapisid') as HTMLInputElement).value.trim();
  const hsapisid = (document.getElementById('authHsapisid') as HTMLInputElement).value.trim();
  const sid = (document.getElementById('authSid') as HTMLInputElement).value.trim();
  const ssid = (document.getElementById('authSsid') as HTMLInputElement).value.trim();

  if (!sapisid || !hsapisid || !sid || !ssid) {
    alert('Por favor, preencha todos os campos.');
    return;
  }

  try {
    await callMcp('save_auth_tokens', { sapisid, hsapisid, sid, ssid });
    logToTerminal('Tokens de autenticação atualizados manualmente.');
    if (manualTokensModal) manualTokensModal.style.display = 'none';
    await checkAuthStatus();
    await loadNotebooks();
  } catch (e: any) {
    alert(`Falha ao salvar tokens: ${e.message}`);
  }
});

// Deep Research handlers
let researchPollingIntervalId: any = null;
let activeResearchTaskId = '';

document.getElementById('btnDeepResearch')?.addEventListener('click', () => {
  if (!activeNotebookId) {
    alert('Selecione um notebook antes de realizar a pesquisa.');
    return;
  }
  const modal = document.getElementById('researchModal');
  const queryInput = document.getElementById('researchQuery') as HTMLInputElement;
  if (modal && queryInput) {
    modal.style.display = 'flex';
    // Prefill query with the notebook name if appropriate
    queryInput.value = activeNotebookName || '';
  }
});

document.getElementById('btnResearchCancel')?.addEventListener('click', () => {
  const modal = document.getElementById('researchModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('btnResearchStart')?.addEventListener('click', async () => {
  const queryInput = document.getElementById('researchQuery') as HTMLInputElement;
  const sourceSelect = document.getElementById('researchSource') as HTMLSelectElement;
  const modeSelect = document.getElementById('researchMode') as HTMLSelectElement;

  const query = queryInput?.value.trim();
  const source = sourceSelect?.value || 'web';
  const mode = modeSelect?.value || 'fast';

  if (!query) {
    alert('Insira um termo de busca.');
    return;
  }

  // Close configuration modal
  const modal = document.getElementById('researchModal');
  if (modal) modal.style.display = 'none';

  // Show status panel
  const panel = document.getElementById('researchStatusPanel');
  const progressText = document.getElementById('researchProgressText');
  const details = document.getElementById('researchDetails');
  const importArea = document.getElementById('researchImportArea');

  if (panel) panel.style.display = 'flex';
  if (progressText) progressText.innerText = 'Inicializando pesquisa profunda...';
  if (details) details.innerText = `Buscando por: "${query}"\nOrigem: ${source}\nModo: ${mode}\nAguardando servidor...`;
  if (importArea) importArea.style.display = 'none';

  try {
    const res = await callMcp('research_start', {
      notebook_id: activeNotebookId,
      query: query,
      source: source,
      mode: mode
    });

    activeResearchTaskId = res.task_id || res.taskId || '';
    if (details) details.innerText += `\n\nTarefa criada!\nTask ID: ${activeResearchTaskId}\nIniciando monitoramento de progresso...`;

    startResearchPolling(activeNotebookId, activeResearchTaskId);
  } catch (err: any) {
    if (progressText) progressText.innerText = 'Erro ao iniciar pesquisa';
    if (details) details.innerText = `Erro: ${err.message}`;
  }
});

function startResearchPolling(notebookId: string, taskId: string) {
  if (researchPollingIntervalId) clearInterval(researchPollingIntervalId);

  const progressText = document.getElementById('researchProgressText');
  const details = document.getElementById('researchDetails');
  const importArea = document.getElementById('researchImportArea');

  researchPollingIntervalId = setInterval(async () => {
    try {
      // Poll with single check (max_wait=0 to avoid blocking the Express proxy thread)
      const statusRes = await callMcp('research_status', {
        notebook_id: notebookId,
        task_id: taskId,
        max_wait: 0,
        compact: false
      });

      if (progressText && details) {
        const status = statusRes.status || 'PENDING';
        progressText.innerText = `Status da pesquisa: ${status}`;

        let log = `Consulta: ${statusRes.query || 'N/A'}\n`;
        log += `Status: ${status}\n`;
        
        if (statusRes.sources && Array.isArray(statusRes.sources)) {
          log += `Fontes encontradas (${statusRes.sources.length}):\n`;
          statusRes.sources.forEach((s: any, idx: number) => {
            log += `- [${idx}] ${s.title || s.name || s.url}\n`;
          });
        } else if (statusRes.discovered_sources) {
          log += `Fontes descobertas: ${JSON.stringify(statusRes.discovered_sources, null, 2)}\n`;
        }

        details.innerText = log;

        if (status === 'completed' || status === 'COMPLETED' || status === 'SUCCESS') {
          clearInterval(researchPollingIntervalId);
          researchPollingIntervalId = null;
          progressText.innerText = 'Pesquisa concluída!';
          
          if (importArea) {
            importArea.style.display = 'block';
            const importBtn = document.getElementById('btnImportResearchSources');
            if (importBtn) {
              importBtn.onclick = async () => {
                importBtn.setAttribute('disabled', 'true');
                importBtn.innerText = 'Importando fontes... 📥';
                try {
                  await callMcp('research_import', {
                    notebook_id: notebookId,
                    task_id: taskId
                  });
                  logToTerminal('Fontes de pesquisa importadas para o notebook.');
                  alert('Fontes importadas com sucesso!');
                  
                  // Close panel and refresh sources
                  const panel = document.getElementById('researchStatusPanel');
                  if (panel) panel.style.display = 'none';
                  loadSources();
                } catch (e: any) {
                  alert(`Erro ao importar: ${e.message}`);
                } finally {
                  importBtn.removeAttribute('disabled');
                  importBtn.innerText = 'Importar Fontes Encontradas 📥';
                }
              };
            }
          }
        } else if (status === 'failed' || status === 'FAILED' || status === 'ERROR') {
          clearInterval(researchPollingIntervalId);
          researchPollingIntervalId = null;
          progressText.innerText = 'Pesquisa falhou';
          if (details) details.innerText += `\n\nErro: O servidor reportou falha na pesquisa profunda.`;
        }
      }
    } catch (e: any) {
      logToTerminal(`Erro de polling de pesquisa: ${e.message}`, true);
    }
  }, 5000);
}

document.getElementById('btnCloseResearchStatus')?.addEventListener('click', () => {
  const panel = document.getElementById('researchStatusPanel');
  if (panel) panel.style.display = 'none';
  if (researchPollingIntervalId) {
    clearInterval(researchPollingIntervalId);
    researchPollingIntervalId = null;
  }
});

// Init on Load
window.addEventListener('load', async () => {
  logToTerminal('Inicializando aplicação...');
  await checkAuthStatus();
  if (isAuthOnline) {
    await loadNotebooks();
  } else {
    logToTerminal('Aviso: O cliente não está autenticado no momento. Acesse a aba "Autenticação" para conectar.', true);
  }
});
