// src/searchEngine.ts
/**
 * Search utilities for PubMed, arXiv, and Europe PMC.
 * Each function returns a promise that resolves to an array of Article objects.
 */

export interface Article {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  pdfUrl?: string;
  source: 'PubMed' | 'arXiv' | 'EuropePMC';
}

// PubMed search using NCBI E-utilities (esearch + efetch)
export async function searchPubMed(query: string, maxResults = 10): Promise<Article[]> {
  const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
  const esearchResp = await fetch(esearchUrl);
  const esearchData = await esearchResp.json();
  const idList = esearchData.esearchresult.idlist as string[];
  if (!idList.length) return [];

  const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${idList.join(',')}&rettype=abstract&retmode=json`;
  const efetchResp = await fetch(efetchUrl);
  const efetchData = await efetchResp.json();
  // NCBI returns XML in JSON wrapper; for brevity, use a simple parser via DOMParser (works in browser)
  const parser = new DOMParser();
  const xml = parser.parseFromString(efetchData.result, 'application/xml');
  const articles: Article[] = [];
  xml.querySelectorAll('PubmedArticle').forEach((node) => {
    const id = node.querySelector('PMID')?.textContent || '';
    const title = node.querySelector('ArticleTitle')?.textContent || '';
    const abstract = node.querySelector('AbstractText')?.textContent || '';
    const authorList = Array.from(node.querySelectorAll('Author')).map((a) => {
      const last = a.querySelector('LastName')?.textContent || '';
      const fore = a.querySelector('ForeName')?.textContent || '';
      return `${fore} ${last}`.trim();
    });
    articles.push({ id, title, authors: authorList, abstract, source: 'PubMed' });
  });
  return articles;
}

// arXiv search via simple HTTP GET – returns ATOM XML
export async function searchArxiv(query: string, maxResults = 10): Promise<Article[]> {
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}`;
  const resp = await fetch(url);
  const text = await resp.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const entries = xml.getElementsByTagName('entry');
  const articles: Article[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const id = entry.getElementsByTagName('id')[0]?.textContent?.split('/').pop() || '';
    const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || '';
    const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim() || '';
    const authorNodes = entry.getElementsByTagName('author');
    const authors: string[] = [];
    for (let j = 0; j < authorNodes.length; j++) {
      const name = authorNodes[j].getElementsByTagName('name')[0]?.textContent;
      if (name) authors.push(name.trim());
    }
    // PDF link is in link[@title='pdf']
    let pdfUrl: string | undefined;
    const linkNodes = entry.getElementsByTagName('link');
    for (let k = 0; k < linkNodes.length; k++) {
      const link = linkNodes[k];
      if (link.getAttribute('title') === 'pdf') {
        pdfUrl = link.getAttribute('href') || undefined;
        break;
      }
    }
    articles.push({ id, title, authors, abstract: summary, pdfUrl, source: 'arXiv' });
  }
  return articles;
}

// Europe PMC search – JSON response
export async function searchEuropePMC(query: string, maxResults = 10): Promise<Article[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resulttype=lite&format=json&pageSize=${maxResults}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const articles: Article[] = (data.resultList?.result || []).map((item: any) => ({
    id: item.id || '',
    title: item.title || '',
    authors: (item.authorString?.split(',') || []).map((a: string) => a.trim()),
    abstract: item.abstractText || '',
    pdfUrl: item.fullTextUrl?.[0]?.url || undefined,
    source: 'EuropePMC' as const,
  }));
  return articles;
}
