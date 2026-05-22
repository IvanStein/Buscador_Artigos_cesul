import './styles.css';
import { App, ConfigManager } from './app';

const app = new App();

const lessonInput = document.getElementById('lessonInput') as HTMLTextAreaElement;
const searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
const resultsDiv = document.getElementById('results') as HTMLElement;
const historyList = document.getElementById('historyList') as HTMLElement;
const mainSearch = document.getElementById('mainSearch') as HTMLElement;
const mainSelected = document.getElementById('mainSelected') as HTMLElement;
const selectedCart = document.getElementById('selectedCart') as HTMLElement;
const cartCount = document.getElementById('cartCount') as HTMLElement;
const btnNextPage = document.getElementById('btnNextPage') as HTMLButtonElement;
const btnBackSearch = document.getElementById('btnBackSearch') as HTMLButtonElement;
const selectedResults = document.getElementById('selectedResults') as HTMLElement;

// Settings UI
const btnSettings = document.getElementById('btnSettings') as HTMLButtonElement;
const settingsModal = document.getElementById('settingsModal') as HTMLElement;
const btnCloseSettings = document.getElementById('btnCloseSettings') as HTMLButtonElement;
const btnSaveSettings = document.getElementById('btnSaveSettings') as HTMLButtonElement;
const inputGroqKey = document.getElementById('inputGroqKey') as HTMLInputElement;
const inputTelegramToken = document.getElementById('inputTelegramToken') as HTMLInputElement;

// State for selected articles
let selectedArticles: any[] = [];

// Load saved searches from localStorage
function loadHistory(): string[] {
  const saved = localStorage.getItem('searchHistory');
  return saved ? JSON.parse(saved) : [];
}

function saveHistory(term: string) {
  let history = loadHistory();
  // Remove if exists to move to top
  history = history.filter(h => h !== term);
  history.unshift(term);
  if (history.length > 10) history.pop();
  localStorage.setItem('searchHistory', JSON.stringify(history));
}

function deleteHistory(term: string, e: Event) {
  e.stopPropagation(); // prevent search trigger
  let history = loadHistory();
  history = history.filter(h => h !== term);
  localStorage.setItem('searchHistory', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  historyList.innerHTML = '';
  
  const emptyText = document.querySelector('.history-empty') as HTMLElement;
  if (!history.length) {
    emptyText.style.display = 'block';
    return;
  }
  
  emptyText.style.display = 'none';
  history.forEach(term => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span>${term}</span> <button class="btn-delete" title="Excluir">❌</button>`;
    
    // Clicking the item searches
    li.onclick = () => startSearch(term);
    
    // Clicking the delete button deletes
    const delBtn = li.querySelector('.btn-delete') as HTMLButtonElement;
    delBtn.onclick = (e) => deleteHistory(term, e);
    
    historyList.appendChild(li);
  });
}

async function startSearch(text: string) {
  lessonInput.value = text;
  resultsDiv.innerHTML = `
    <div id="loadingMsg" class="loading-container">
      <div class="spinner"></div>
      <p>Buscando nas fontes oficiais (PubMed, arXiv, Europe PMC)...</p>
    </div>
  `;
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
  ul.className = 'article-list';
  articles.forEach(a => {
    const li = document.createElement('li');
    li.className = 'article-card';
    
    const sourceName = a.source === 'pubmed' ? 'PubMed' : a.source === 'arxiv' ? 'arXiv' : 'Europe PMC';
    const hasPdf = !!a.pdfUrl;
    const btnText = hasPdf ? '⬇️ Baixar PDF' : '🔗 Acessar Artigo';
    const shortAbstract = a.abstract ? (a.abstract.length > 300 ? a.abstract.substring(0, 300) + '...' : a.abstract) : 'Resumo não disponível.';
    
    // Check if already selected
    const isSelected = selectedArticles.some(sel => sel.id === a.id);
    const selectBtnText = isSelected ? '✅ Selecionado' : '➕ Selecionar para uso';
    const selectBtnClass = isSelected ? 'btn-select selected' : 'btn-select';
    
    li.innerHTML = `
      <div class="article-info">
        <h4 class="article-title">${a.title}</h4>
        <p class="article-abstract" style="cursor:pointer;" title="Clique para expandir">${shortAbstract}</p>
        <div class="article-meta">
          <span class="badge badge-${a.source}">${sourceName}</span>
        </div>
      </div>
      <div class="action-bar" style="flex-direction: column; align-items: flex-end;">
        <button class="btn-download">${btnText}</button>
        <button class="${selectBtnClass}">${selectBtnText}</button>
      </div>
    `;
    
    // Abstract expand toggle
    const abstractP = li.querySelector('.article-abstract') as HTMLElement;
    abstractP.onclick = () => {
      if (abstractP.style.webkitLineClamp === 'unset') {
        abstractP.style.webkitLineClamp = '3';
        abstractP.textContent = shortAbstract;
      } else {
        abstractP.style.webkitLineClamp = 'unset';
        abstractP.textContent = a.abstract || 'Resumo não disponível.';
      }
    };
    
    // Download logic
    const btnDownload = li.querySelector('.btn-download') as HTMLButtonElement;
    btnDownload.onclick = async () => {
      try {
        const pdf = await app.articleMgr.downloadPdf(a);
        window.open(pdf, '_blank');
      } catch (err) {
        alert('PDF não disponível');
      }
    };
    
    // Select logic
    const btnSelect = li.querySelector('.btn-select') as HTMLButtonElement;
    btnSelect.onclick = async () => {
      if (selectedArticles.some(sel => sel.id === a.id)) {
        selectedArticles = selectedArticles.filter(sel => sel.id !== a.id);
        btnSelect.className = 'btn-select';
        btnSelect.textContent = '➕ Selecionar para uso';
      } else {
        selectedArticles.push(a);
        btnSelect.className = 'btn-select selected';
        btnSelect.textContent = '✅ Selecionado';
        
        // Auto-download IF pdfUrl exists directly
        if (a.pdfUrl) {
           window.open(a.pdfUrl, '_blank');
        }
      }
      updateCartUI();
    };
    
    ul.appendChild(li);
  });
  resultsDiv.appendChild(ul);
});

function updateCartUI() {
  cartCount.textContent = selectedArticles.length.toString();
  if (selectedArticles.length > 0) {
    selectedCart.style.display = 'block';
  } else {
    selectedCart.style.display = 'none';
  }
}

// Next Page Navigation
btnNextPage.onclick = async () => {
  mainSearch.style.display = 'none';
  mainSelected.style.display = 'flex';
  renderSelectedArticles();
};

btnBackSearch.onclick = () => {
  mainSearch.style.display = 'flex';
  mainSelected.style.display = 'none';
};

async function renderSelectedArticles() {
  selectedResults.innerHTML = '<p>Preparando material e traduzindo resumos, aguarde...</p>';
  
  if (selectedArticles.length === 0) {
    selectedResults.innerHTML = '<p>Nenhum artigo selecionado.</p>';
    return;
  }
  
  const ul = document.createElement('ul');
  ul.className = 'article-list';
  
  for (const a of selectedArticles) {
    const li = document.createElement('li');
    li.className = 'article-card';
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';
    
    // Here we will inject translated abstract using Groq soon.
    // And ABNT citation.
    const abntCitation = app.articleMgr.generateABNT(a);
    
    li.innerHTML = `
      <div class="article-info" style="width: 100%;">
        <h4 class="article-title" style="color: var(--color-primary);">${a.title}</h4>
        <p><strong>Abstract Original:</strong> ${a.abstract}</p>
        <p><strong>Tradução (Groq):</strong> <em class="groq-translation" data-id="${a.id}">Traduzindo...</em></p>
        <div class="abnt-box">${abntCitation}</div>
      </div>
    `;
    ul.appendChild(li);
  }
  
  selectedResults.innerHTML = '';
  selectedResults.appendChild(ul);
  
  // Fire translations in background
  for (const a of selectedArticles) {
    app.engine.translateText(a.abstract).then(translated => {
      const el = document.querySelector(`.groq-translation[data-id="${a.id}"]`);
      if (el) el.textContent = translated;
    }).catch(() => {
      const el = document.querySelector(`.groq-translation[data-id="${a.id}"]`);
      if (el) el.textContent = "Erro na tradução.";
    });
  }
}

// Settings Logic
btnSettings.onclick = () => {
  inputGroqKey.value = ConfigManager.getGroqKey();
  inputTelegramToken.value = ConfigManager.getTelegramToken();
  settingsModal.style.display = 'flex';
};

btnCloseSettings.onclick = () => {
  settingsModal.style.display = 'none';
};

btnSaveSettings.onclick = () => {
  ConfigManager.setGroqKey(inputGroqKey.value.trim());
  ConfigManager.setTelegramToken(inputTelegramToken.value.trim());
  settingsModal.style.display = 'none';
  alert('Configurações salvas localmente com sucesso!');
};

// Initialize UI
renderHistory();
