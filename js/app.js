// Hash router: each tab is a module exporting render(viewEl).
import { $, closeSheet } from './ui.js';

const TABS = ['home', 'closet', 'add', 'history', 'settings'];

async function route() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  closeSheet();
  const view = $('#view');
  try {
    const mod = await import(`./${tab}.js`);
    await mod.render(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty-state"><p>Something went wrong.</p><p class="muted">${err.message}</p></div>`;
  }
  window.scrollTo(0, 0);
}

addEventListener('hashchange', route);
addEventListener('visibilitychange', () => !document.hidden && route()); // resumed Home Screen app: refresh the day
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
