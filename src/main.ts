import './styles.css';
import App from './app.ts';

const app = new App();

const lessonInput = document.getElementById('lessonInput') as HTMLTextAreaElement;
const searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
const resultsDiv = document.getElementById('results') as HTMLElement;

// Load saved searches from localStorage
function loadHistory(): string[] {
  const saved = localStorage.getItem('searchHistory');
  return saved ? JSON.parse(saved) : [];
}

function saveHistory(term: string) {
  const history = loadHistory();
  history.unshift(term);
  if (history.length > 10) history.pop();
  localStorage.setItem('searchHistory', JSON.stringify(history));
}

function renderHistory() {
  const history = loadHistory();
  const container = document.getElementById('history')!;
  container.innerHTML = '';
  if (!history.length) return;
  const ul = document.createElement('ul');
  ul.className = 'list';
  history.forEach(term => {
    const li = document.createElement('li');
    li.textContent = term;
    li.style.cursor = 'pointer';
    li.onclick = () => startSearch(term);
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

async function startSearch(text: string) {
  lessonInput.value = text;
  resultsDiv.innerHTML = '<p id="loadingMsg">⏳ Buscando artigos, por favor aguarde...</p>';
  searchBtn.disabled = true;
  searchBtn.textContent = 'Buscando...';

  try {
    await app.runLesson(text);
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML += '<p style="color: #ff6b6b;">Erro ao buscar artigos.</p>';
  } finally {
    const loadingMsg = document.getElementById('loadingMsg');
    if (loadingMsg) loadingMsg.remove();
    searchBtn.disabled = false;
    searchBtn.textContent = '🔍 Buscar Artigos';
  }

  saveHistory(text);
  renderHistory();
}

searchBtn.addEventListener('click', () => {
  const txt = lessonInput.value.trim();
  if (txt) startSearch(txt);
});

// Listen for search results dispatched by App
window.addEventListener('search-results', (e: Event) => {
  const custom = e as CustomEvent;
  const { topic, articles } = custom.detail as { topic: string; articles: any[] };
  const header = document.createElement('h3');
  header.textContent = `Tópico: ${topic} (${articles.length} resultados)`;
  resultsDiv.appendChild(header);

  if (articles.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.textContent = 'Nenhum artigo encontrado.';
    resultsDiv.appendChild(emptyMsg);
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'list';
  articles.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${a.title}</strong> <span>${a.source}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Download PDF';
    btn.onclick = async () => {
      try {
        const pdf = await app.articleMgr.downloadPdf(a);
        window.open(pdf, '_blank');
      } catch (err) {
        alert('PDF não disponível');
      }
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
  resultsDiv.appendChild(ul);
});

// Initialize UI
renderHistory();
