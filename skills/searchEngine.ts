// skills/searchEngine.ts
/**
 * Search utilities for PubMed, arXiv, and Europe PMC.
 * Exported functions are used by the frontend (src/app.ts) and by Vercel serverless functions.
 */
export interface Article {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdfUrl?: string;
  source: 'PubMed' | 'arXiv' | 'EuropePMC';
  year?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
}

// PubMed search using NCBI E‑utilities (esearch + efetch)
export async function searchPubMed(query: string, maxResults = 10): Promise<Article[]> {
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
  const esearchResp = await fetch(esearchUrl);
  const esearchData = await esearchResp.json();
  const idList = (esearchData.esearchresult?.idlist ?? []) as string[];
  if (!idList.length) return [];

  const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${idList.join(',')}&rettype=abstract&retmode=xml`;
  const efetchResp = await fetch(efetchUrl);
  const xmlText = await efetchResp.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const articles: Article[] = [];
  xml.querySelectorAll('PubmedArticle').forEach((node) => {
    const id = node.querySelector('PMID')?.textContent?.trim() ?? '';
    const title = node.querySelector('ArticleTitle')?.textContent?.trim() ?? '';
    const abstract = node.querySelector('AbstractText')?.textContent?.trim() ?? '';
    const authorList = Array.from(node.querySelectorAll('Author')).map((a) => {
      const fore = a.querySelector('ForeName')?.textContent?.trim() ?? '';
      const last = a.querySelector('LastName')?.textContent?.trim() ?? '';
      return `${last}, ${fore}`.trim();
    });
    const journal = (node.querySelector('Journal Title')?.textContent?.trim() || node.querySelector('Journal ISOAbbreviation')?.textContent?.trim()) ?? '';
    const year = (node.querySelector('PubDate Year')?.textContent?.trim() || node.querySelector('ArticleDate Year')?.textContent?.trim()) ?? '';
    const volume = node.querySelector('JournalIssue Volume')?.textContent?.trim() ?? '';
    const issue = node.querySelector('JournalIssue Issue')?.textContent?.trim() ?? '';
    const pages = node.querySelector('Pagination MedlinePgn')?.textContent?.trim() ?? '';
    const doiNode = Array.from(node.querySelectorAll('ArticleId')).find(id => id.getAttribute('IdType') === 'doi');
    const doi = doiNode ? doiNode.textContent?.trim() : '';

    articles.push({ id, title, authors: authorList, abstract, source: 'PubMed', year, journal, volume, issue, pages, doi });
  });
  return articles;
}

// arXiv search via ATOM feed (XML)
export async function searchArxiv(query: string, maxResults = 10): Promise<Article[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`;
  const resp = await fetch(url);
  const text = await resp.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const entries = xml.getElementsByTagName('entry');
  const articles: Article[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const id = entry.getElementsByTagName('id')[0]?.textContent?.split('/').pop()?.trim() ?? '';
    const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() ?? '';
    const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim() ?? '';
    const authorNodes = entry.getElementsByTagName('author');
    const authors: string[] = [];
    for (let j = 0; j < authorNodes.length; j++) {
      const name = authorNodes[j].getElementsByTagName('name')[0]?.textContent?.trim();
      if (name) authors.push(name);
    }
    // PDF link detection
    let pdfUrl: string | undefined;
    const linkNodes = entry.getElementsByTagName('link');
    for (let k = 0; k < linkNodes.length; k++) {
      const link = linkNodes[k];
      if (link.getAttribute('title') === 'pdf') {
        pdfUrl = link.getAttribute('href') ?? undefined;
        break;
      }
    }
    const published = entry.getElementsByTagName('published')[0]?.textContent?.trim() ?? '';
    const year = published ? published.split('-')[0] : '';
    const doi = Array.from(linkNodes).find(l => l.getAttribute('title') === 'doi')?.getAttribute('href')?.split('doi.org/')[1] ?? '';
    const journal = 'arXiv preprint';

    articles.push({ id, title, authors, abstract: summary, pdfUrl, source: 'arXiv', year, journal, doi });
  }
  return articles;
}

// Europe PMC search – JSON format
export async function searchEuropePMC(query: string, maxResults = 10): Promise<Article[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resulttype=lite&format=json&pageSize=${maxResults}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const results = data.resultList?.result ?? [];
  return results.map((item: any) => ({
    id: item.id ?? '',
    title: item.title ?? '',
    authors: (item.authorString?.split(',') ?? []).map((a: string) => a.trim()),
    abstract: item.abstractText ?? '',
    pdfUrl: item.fullTextUrl?.[0]?.url,
    source: 'EuropePMC' as const,
    year: item.pubYear ?? '',
    journal: item.journalTitle ?? '',
    volume: item.journalVolume ?? '',
    issue: item.issue ?? '',
    pages: item.pageInfo ?? '',
    doi: item.doi ?? '',
  }));
}
