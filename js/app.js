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
// Resumed Home Screen app: refresh Home only (the day may have changed). Other tabs keep open sheets and typed text.
addEventListener('visibilitychange', () => !document.hidden && $('.tabbar a.active')?.dataset.tab === 'home' && route());
route();

// Updates: check on every open/resume; when a new version takes over, reload once so it shows straight away.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    addEventListener('visibilitychange', () => !document.hidden && reg.update().catch(() => {}));
  }).catch(console.error);
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !closing) { closing = true; location.reload(); } });
}
let closing = false;
