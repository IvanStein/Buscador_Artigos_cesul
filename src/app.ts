/* src/app.ts */
// Core logic for article search – browser‑only (no Node process env)

export interface Article {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdfUrl?: string; // direct link to PDF if available
  source: 'pubmed' | 'arxiv' | 'europepmc';
}

export class SearchEngine {
  // No direct access to process.env – Vite exposes env vars via import.meta.env
  // If needed later, you can read VITE_* variables here.

  // Simple keyword extraction for MVP
  generateTopics(lessonText: string): string[] {
    const words = lessonText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4);
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
    const ids = data.esearchresult?.idlist || [];
    // For MVP we mock the metadata – real implementation would fetch details via efetch.
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
  async downloadPdf(article: Article): Promise<string> {
    if (!article.pdfUrl) throw new Error('No PDF URL available');
    // In the MVP we simply return the URL – the front‑end opens it in a new tab.
    return article.pdfUrl;
  }
}

export class TelegramNotifier {
  private token = '';
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
  private engine = new SearchEngine();
  public articleMgr = new ArticleManager();
  private telegram = new TelegramNotifier();

  async runLesson(lessonText: string) {
    const topics = this.engine.generateTopics(lessonText);
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
