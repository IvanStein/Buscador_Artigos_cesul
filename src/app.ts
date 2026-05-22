/* src/app.ts */
// Simple OO core for the MVP. All logic lives here and is used by main.ts.

export interface Article {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdfUrl?: string; // direct link to PDF if available
  source: 'pubmed' | 'arxiv' | 'europepmc';
}

export class SearchEngine {
  private readonly tavilyKey = process.env.TAVILY_API_KEY ?? '';
  private readonly groqKey = process.env.GROQ_API_KEY ?? '';
  private readonly elsevierKey = process.env.ELSEVIER_API_KEY ?? '';

  // Generate topics from lesson text – very naive implementation (keywords extraction).
  generateTopics(lessonText: string): string[] {
    const words = lessonText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4);
    // Return top 5 most frequent words as pseudo‑topics
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  async searchAll(query: string): Promise<Article[]> {
    const [pubmed, arxiv, epmc] = await Promise.all([
      this.searchPubMed(query),
      this.searchArxiv(query),
      this.searchEuropePMC(query),
    ]);
    return [...pubmed, ...arxiv, ...epmc];
  }

  async searchPubMed(query: string): Promise<Article[]> {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      query,
    )}&retmax=5&format=json`;
    const resp = await fetch(url);
    const data = await resp.json();
    const ids = data.esearchresult.idlist || [];
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=abstract&retmode=json`;
    const detailsResp = await fetch(fetchUrl);
    const details = await detailsResp.json();
    // Simplify – map to Article (real response is XML; for MVP we assume JSON fields)
    return ids.map((id: string) => ({
      id,
      title: `PubMed article ${id}`,
      authors: [],
      abstract: `Abstract for PubMed ${id}`,
      source: 'pubmed',
    }));
  }

  async searchArxiv(query: string): Promise<Article[]> {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
      query,
    )}&max_results=5`;
    const resp = await fetch(url);
    const text = await resp.text();
    // Very light XML parsing – extract <entry> titles
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'application/xml');
    const entries = Array.from(xml.querySelectorAll('entry'));
    return entries.map((e, idx) => {
      const id = e.querySelector('id')?.textContent?.split('/').pop() ?? `arxiv-${idx}`;
      const title = e.querySelector('title')?.textContent?.trim() ?? 'Untitled';
      const summary = e.querySelector('summary')?.textContent?.trim() ?? '';
      const pdfLink = Array.from(e.querySelectorAll('link')).find(l => l.getAttribute('title') === 'pdf')?.getAttribute('href');
      return { id, title, authors: [], abstract: summary, pdfUrl: pdfLink, source: 'arxiv' } as Article;
    });
  }

  async searchEuropePMC(query: string): Promise<Article[]> {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
      query,
    )}&pageSize=5&format=json`;
    const resp = await fetch(url);
    const data = await resp.json();
    const resultList = data.resultList?.result || [];
    return resultList.map((r: any) => ({
      id: r.id,
      title: r.title,
      authors: (r.authorString ?? '').split(',').map((a: string) => a.trim()),
      abstract: r.abstractText ?? '',
      pdfUrl: r.fullTextUrl?.url,
      source: 'europepmc',
    } as Article));
  }
}

export class ArticleManager {
  // Placeholder for future PDF download implementation.
  async downloadPdf(article: Article): Promise<string> {
    if (!article.pdfUrl) throw new Error('No PDF URL available');
    // In the MVP the front‑end just returns the URL; actual download is handled server‑side.
    return article.pdfUrl;
  }
}

export class TelegramNotifier {
  private token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  private chatId = '';
  setChat(chatId: string) {
    this.chatId = chatId;
  }
  async sendMessage(text: string) {
    if (!this.token || !this.chatId) return;
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: this.chatId, text }),
    });
  }
}

export class YouTubeDownloader {
  // This class will just forward a request to our serverless function.
  async download(url: string): Promise<string> {
    const resp = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    return data.fileUrl; // URL to the generated file on Vercel CDN
  }
}

export class App {
  private engine = new SearchEngine();
  private articleMgr = new ArticleManager();
  private telegram = new TelegramNotifier();

  async runLesson(lessonText: string) {
    const topics = this.engine.generateTopics(lessonText);
    const resultsDiv = document.getElementById('results') as HTMLElement;
    resultsDiv.innerHTML = '';
    this.telegram.sendMessage(`🔍 Gerando tópicos para: ${lessonText}`);
    for (const t of topics) {
      const header = document.createElement('h3');
      header.textContent = `Tópico: ${t}`;
      resultsDiv.appendChild(header);
      const articles = await this.engine.searchAll(t);
      const ul = document.createElement('ul');
      ul.className = 'list';
      articles.forEach(a => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${a.title}</strong> <span>${a.source}</span>`;
        const btn = document.createElement('button');
        btn.textContent = 'Download PDF';
        btn.onclick = async () => {
          try {
            const pdf = await this.articleMgr.downloadPdf(a);
            window.open(pdf, '_blank');
          } catch (e) {
            alert('PDF não disponível');
          }
        };
        li.appendChild(btn);
        ul.appendChild(li);
      });
      resultsDiv.appendChild(ul);
    }
  }
}

// Export for main.ts to instantiate
export default App;
