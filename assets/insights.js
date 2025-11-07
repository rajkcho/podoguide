const ARTICLES_URL = '/podoguide/insights/articles.json';

async function loadArticles(){
  try{
    const resp = await fetch(ARTICLES_URL, {cache:'no-cache'});
    if(!resp.ok) throw new Error('Unable to load insights');
    return await resp.json();
  }catch(err){
    console.error(err);
    return [];
  }
}

function renderList(articles){
  const listEl = document.getElementById('insights-list');
  if(!listEl) return;
  if(!articles.length){
    listEl.innerHTML = '<p class="meta">No insights published yet. Check back soon.</p>';
    return;
  }
  listEl.innerHTML = '';
  articles.forEach(article=>{
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="article-hero"><img src="${article.heroImage}" alt="${article.title}" loading="lazy"></div>
      <h3>${article.title}</h3>
      <p class="meta">Mary Voight, DPM · ${new Date(article.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})} · ${article.readTime} min read</p>
      <p>${article.excerpt}</p>
      <a class="btn primary" href="/podoguide/insights/${article.id}/">Read article →</a>
    `;
    listEl.appendChild(card);
  });
}

function renderArticle(articles){
  const root = document.getElementById('article-root');
  if(!root) return;
  const targetId = root.dataset.articleId;
  const article = articles.find(a=>a.id === targetId);
  if(!article){
    root.innerHTML = '<p class="meta">Article not found.</p>';
    return;
  }
  document.title = `${article.title} • PodoGuide Insights`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if(metaDesc){ metaDesc.setAttribute('content', article.seoDescription || article.excerpt); }
  const hero = document.createElement('div');
  hero.className = 'article-hero';
  hero.innerHTML = `<img src="${article.heroImage}" alt="${article.title}">`;
  const heading = document.createElement('h1');
  heading.textContent = article.title;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = `Mary Voight, DPM · ${new Date(article.date).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})} · ${article.readTime} min read`;
  const author = document.createElement('div');
  author.className = 'author-card';
  author.innerHTML = `
    <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=320&q=80" alt="Portrait of Mary Voight, DPM — blonde woman in her 30s with bold lipstick and modern glasses" width="64" height="64"/>
    <div>
      <strong>Mary Voight, DPM</strong>
      <span class="meta">Clinical editor &amp; podiatric surgeon</span>
    </div>
  `;
  const body = document.createElement('div');
  body.className = 'insight-body';
  article.body.forEach(paragraph=>{
    const p = document.createElement('p');
    p.innerHTML = paragraph;
    body.appendChild(p);
  });
  root.innerHTML = '';
  root.appendChild(hero);
  root.appendChild(heading);
  root.appendChild(meta);
  root.appendChild(author);
  root.appendChild(body);
}

function renderHomeSummaries(articles){
  const grid = document.getElementById('home-insights-grid');
  if(!grid) return;
  const limit = parseInt(grid.dataset.limit || '3', 10);
  const subset = articles.slice(0, limit);
  if(!subset.length){
    grid.innerHTML = '<p class="meta">Latest insights will appear here soon.</p>';
    return;
  }
  grid.innerHTML = '';
  subset.forEach(article=>{
    const card = document.createElement('article');
    card.className = 'insight-card';
    card.innerHTML = `
      <img src="${article.heroImage}" alt="${article.title}" loading="lazy">
      <div class="content">
        <h3>${article.title}</h3>
        <p class="meta">Mary Voight, DPM · ${new Date(article.date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</p>
        <p>${article.excerpt}</p>
        <a href="/podoguide/insights/${article.id}/">Read the full article →</a>
      </div>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const articles = await loadArticles();
  renderList(articles);
  renderArticle(articles);
  renderHomeSummaries(articles);
});
