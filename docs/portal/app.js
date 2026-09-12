/* Progressive enhancement only: source text never becomes executable HTML. */
(() => {
  'use strict';
  const pages = [...document.querySelectorAll('[data-page]')];
  const byId = new Map(pages.map(page => [page.id, page]));
  const input = document.getElementById('search');
  const results = document.getElementById('searchResults');
  const status = document.getElementById('searchStatus');
  const normalize = value => value.normalize('NFKC').toLowerCase();
  const index = pages.map(page => ({page, title:normalize(page.dataset.title), text:normalize(page.textContent)}));
  function showPage(focus = false) {
    const id = location.hash.slice(1);
    // Skip links still focus main rather than being interpreted as document routes.
    if (id === 'content') { document.getElementById('content').focus(); return; }
    const selected = byId.get(id) ?? byId.get('start');
    for (const page of pages) page.hidden = page !== selected;
    for (const link of document.querySelectorAll('[data-nav]')) {
      if (link.dataset.nav === selected.id) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    document.title = `${selected.dataset.title} · NEKON Docs`;
    if (focus) selected.querySelector('h1').focus();
  }
  function search() {
    const query = normalize(input.value.slice(0,160)).trim();
    if (input.value.length > 160) input.value = input.value.slice(0,160);
    results.replaceChildren();
    results.hidden = !query;
    if (!query) { status.textContent = ''; return; }
    const words = query.split(/\s+/);
    const rank = item => item.title === query ? 3 : item.title.includes(query) ? 2 :
      words.every(word => item.title.includes(word)) ? 1 : 0;
    const matches = index.filter(item => words.every(word=>item.text.includes(word)))
      .sort((left,right) => rank(right)-rank(left));
    status.textContent = `${matches.length} ${matches.length === 1 ? 'page' : 'pages'} found.`;
    for (const {page} of matches) {
      const li=document.createElement('li');
      const link=document.createElement('a');
      link.href=`#${page.id}`;
      link.textContent=page.dataset.title;
      li.append(link); results.append(li);
    }
  }
  input.addEventListener('input',search);
  input.addEventListener('keydown',event=>{
    if (event.key === 'Escape') { input.value='';search(); }
    else if (event.key === 'Enter' && results.querySelector('a')) {
      event.preventDefault();results.querySelector('a').click();
    }
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target=link.getAttribute('href').slice(1);
    if (byId.has(target)) {
      // A same-page link does not dispatch hashchange; still move keyboard focus.
      if (location.hash === `#${target}`) showPage(true);
      input.value='';search();
    }
  });
  window.addEventListener('hashchange',()=>showPage(true));
  window.addEventListener('pagehide',()=>{input.value='';search();});
  input.disabled = false;
  document.getElementById('searchHelp').hidden = true;
  showPage();
})();
