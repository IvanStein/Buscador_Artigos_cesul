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
  async generateTopics(lessonText: string): Promise<string[]> {
    const groqKey = ConfigManager.getGroqKey();
    
    const translateFallback = async (text: string): Promise<string> => {
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt|en`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
      } catch (err) {
        console.error('MyMemory API error:', err);
      }
      return text;
    };

    const fallbackExtraction = (text: string): string[] => {
      const stopWords = new Set([
        'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 
        'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 
        'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 
        'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 
        'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 
        'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 
        'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 
        'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 
        'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 
        'some', 'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 
        'there', 'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 
        'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 
        'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 
        'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 
        'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves', 'challenges', 'desafios', 'gestao', 
        'gestão', 'management', 'organization', 'organizations'
      ]);

      const cleanText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const words = cleanText.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      
      const hasGenZ = cleanText.includes('generation z') || cleanText.includes('gen z');
      const genZTerm = cleanText.includes('generation z') ? 'generation z' : 'gen z';

      if (words.length === 0) {
        return [text.split(' ').slice(0, 3).join(' ')];
      }

      const uniqueWords = Array.from(new Set(words));
      const filteredWords = uniqueWords.filter(w => !['generation', 'gen', 'z'].includes(w));
      const queries: string[] = [];

      if (hasGenZ) {
        if (filteredWords.length > 0) {
          queries.push(`"${genZTerm}" ${filteredWords[0]}`);
          if (filteredWords[1]) {
            queries.push(`"${genZTerm}" ${filteredWords[1]}`);
          }
          queries.push(`"${genZTerm}"`);
        } else {
          queries.push(`"${genZTerm}"`);
        }
      } else {
        queries.push(words.slice(0, 3).join(' '));
        if (words.length > 1) {
          queries.push(`${words[0]} ${words[1]}`);
        }
        if (words.length > 2) {
          queries.push(`${words[0]} ${words[2]}`);
        }
      }

      return Array.from(new Set(queries)).slice(0, 3);
    };

    if (!groqKey) {
      const translatedText = await translateFallback(lessonText);
      return fallbackExtraction(translatedText);
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
      
      if (!resp.ok) {
        console.error('Groq API error response:', data);
        throw new Error(data.error?.message || 'Groq API request failed');
      }

      const content = data.choices?.[0]?.message?.content || '';
      const topics = content.split(',').map((s: string) => s.trim()).filter(Boolean);
      
      if (topics.length === 0) {
         const translatedText = await translateFallback(lessonText);
         return fallbackExtraction(translatedText);
      }
      return topics;
    } catch (err) {
      console.error('Groq AI error:', err);
      const translatedText = await translateFallback(lessonText);
      return fallbackExtraction(translatedText);
    }
  }

  // Translate abstract using Groq
  async translateText(text: string): Promise<string> {
    if (!text || text.trim() === '' || text === 'Resumo não disponível.') return '(Sem resumo para traduzir)';
    
    const groqKey = ConfigManager.getGroqKey();
    if (!groqKey) return '(Configure a chave Groq para habilitar tradução automática)';

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
      if (!resp.ok) {
        console.error('Groq Translation API error response:', data);
        return `(Erro na API de tradução: ${data.error?.message || 'Falha desconhecida'})\n\n${text}`;
      }
      return data.choices?.[0]?.message?.content || 'Erro ao extrair tradução da resposta.';
    } catch (err) {
      console.error('Translation error:', err);
      return `(Erro de conexão na tradução)\n\n${text}`;
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

export interface TelegramMessage {
  id: number;
  chatId: number;
  senderName: string;
  text: string;
  date: number;
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

  async getUpdates(offset: number = 0): Promise<{ messages: TelegramMessage[], nextOffset: number }> {
    const token = ConfigManager.getTelegramToken();
    if (!token) return { messages: [], nextOffset: offset };

    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`);
      const data = await resp.json();
      if (!data.ok) return { messages: [], nextOffset: offset };

      const messages: TelegramMessage[] = [];
      let nextOffset = offset;

      for (const item of data.result) {
        if (item.update_id >= nextOffset) {
          nextOffset = item.update_id + 1;
        }
        if (item.message && item.message.text) {
          messages.push({
            id: item.message.message_id,
            chatId: item.message.chat.id,
            senderName: item.message.from?.first_name || 'Usuário',
            text: item.message.text,
            date: item.message.date * 1000,
          });
        }
      }
      return { messages, nextOffset };
    } catch (e) {
      console.error('Telegram getUpdates error:', e);
      return { messages: [], nextOffset: offset };
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
