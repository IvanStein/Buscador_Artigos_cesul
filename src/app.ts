/* src/app.ts */
import { searchPubMed, searchArxiv, searchEuropePMC, type Article as RealArticle } from '../skills/searchEngine';

// Re-export the expanded article interface
export type Article = RealArticle;

export class ConfigManager {
  static getGroqKey(): string {
    return localStorage.getItem('api_key_groq') || import.meta.env.VITE_GROQ_API_KEY || '';
  }
  static setGroqKey(key: string) {
    localStorage.setItem('api_key_groq', key);
  }
  static getTelegramToken(): string {
    return localStorage.getItem('api_key_telegram') || import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
  }
  static setTelegramToken(token: string) {
    localStorage.setItem('api_key_telegram', token);
  }
}

export class SearchEngine {
  // Use Groq to generate intelligent search topics, or fallback to simple extraction
  async generateTopics(lessonText: string): Promise<string[]> {
    const groqKey = ConfigManager.getGroqKey();
    if (!groqKey) {
      // Fallback simple keyword extraction
      const words = lessonText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 4);
      const freq: Record<string, number> = {};
      for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
      return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
    }

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [{
            role: 'system',
            content: 'Extraia 3 a 5 palavras-chave ou termos de busca curtos (em inglês) do seguinte tema de aula. Retorne APENAS os termos separados por vírgula.'
          }, {
            role: 'user',
            content: lessonText
          }],
          temperature: 0.3
        })
      });
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      return content.split(',').map((s: string) => s.trim()).filter(Boolean);
    } catch (err) {
      console.error('Groq AI error:', err);
      return lessonText.split(' ').slice(0, 3);
    }
  }

  // Translate abstract using Groq
  async translateText(text: string): Promise<string> {
    if (!text || text === 'Resumo não disponível.') return text;
    
    const groqKey = ConfigManager.getGroqKey();
    if (!groqKey) return '(Configure a chave Groq nas Configurações do sistema para habilitar tradução automática) ' + text;

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [{
            role: 'system',
            content: 'Traduza o seguinte resumo científico (abstract) do inglês para o português do Brasil. Mantenha o jargão científico correto e um tom acadêmico.'
          }, {
            role: 'user',
            content: text
          }],
          temperature: 0.2
        })
      });
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || 'Erro ao traduzir.';
    } catch (err) {
      console.error('Translation error:', err);
      return 'Erro de conexão na tradução.';
    }
  }

  async searchAll(query: string): Promise<Article[]> {
    const [pubmed, arxiv, epmc] = await Promise.all([
      searchPubMed(query).catch(e => { console.error('PubMed error:', e); return []; }),
      searchArxiv(query).catch(e => { console.error('arXiv error:', e); return []; }),
      searchEuropePMC(query).catch(e => { console.error('EuropePMC error:', e); return []; }),
    ]);
    return [...pubmed, ...arxiv, ...epmc];
  }
}

export class ArticleManager {
  async downloadPdf(article: Article): Promise<string> {
    if (article.pdfUrl) return article.pdfUrl;
    
    // Fallback to the article's web page if a direct PDF link isn't available
    if (article.source.toLowerCase() === 'pubmed') return `https://pubmed.ncbi.nlm.nih.gov/${article.id}/`;
    if (article.source.toLowerCase() === 'arxiv') return `https://arxiv.org/abs/${article.id}`;
    if (article.source.toLowerCase() === 'europepmc') return `https://europepmc.org/article/MED/${article.id}`;

    throw new Error('Link não disponível');
  }

  generateABNT(a: Article): string {
    const authors = a.authors && a.authors.length > 0 
      ? a.authors.join('; ').toUpperCase() 
      : 'AUTOR DESCONHECIDO';
    const title = a.title || 'Título indisponível';
    const journal = (a as any).journal ? (a as any).journal : a.source;
    const year = (a as any).year || 's.d.';
    const vol = (a as any).volume ? `v. ${(a as any).volume}, ` : '';
    const issue = (a as any).issue ? `n. ${(a as any).issue}, ` : '';
    const pages = (a as any).pages ? `p. ${(a as any).pages}, ` : '';
    const doiPart = (a as any).doi ? ` DOI: ${(a as any).doi}.` : '';
    const urlPart = a.pdfUrl ? ` Disponível em: <${a.pdfUrl}>.` : '';
    
    return `${authors}. ${title}. ${journal}, ${vol}${issue}${pages}${year}.${doiPart}${urlPart}`;
  }
}

export class TelegramNotifier {
  private chatId = '';
  setChat(chatId: string) {
    this.chatId = chatId;
  }
  async sendMessage(text: string) {
    const token = ConfigManager.getTelegramToken();
    if (!token || !this.chatId) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text }),
      });
    } catch (e) {
      console.error('Telegram error:', e);
    }
  }
}

export class YouTubeDownloader {
  async download(url: string): Promise<string> {
    const resp = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    return data.fileUrl;
  }
}

export class App {
  public engine = new SearchEngine();
  public articleMgr = new ArticleManager();
  private telegram = new TelegramNotifier();

  async runLesson(lessonText: string) {
    const topics = await this.engine.generateTopics(lessonText);
    // Send a brief notification (optional) – token can be set via env later.
    await this.telegram.sendMessage(`🔍 Gerando tópicos para: ${lessonText}`);
    // Clear previous results (UI handled by main.ts)
    for (const t of topics) {
      const articles = await this.engine.searchAll(t);
      // The UI rendering is performed in main.ts – we simply expose the data via a custom event.
      const event = new CustomEvent('search-results', { detail: { topic: t, articles } });
      window.dispatchEvent(event);
    }
  }
}

export default App;
