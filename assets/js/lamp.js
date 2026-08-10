// The lamp in the top corner. Tapping it lights the flame and dims the room,
// leaving the diary or the article sheet in a warm pool of light. The choice
// is remembered across pages and visits.
(() => {
  const KEY = 'twoticks-lamp';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (error) { /* private mode */ }
  if (saved === 'night') document.body.classList.add('is-night');

  const button = document.querySelector('[data-lamp]');
  if (!button) return;

  function sync() {
    const night = document.body.classList.contains('is-night');
    button.setAttribute('aria-pressed', night ? 'true' : 'false');
    button.setAttribute('aria-label', night ? 'Put the lamp out' : 'Light the lamp');
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    document.body.classList.toggle('is-night');
    try {
      localStorage.setItem(KEY, document.body.classList.contains('is-night') ? 'night' : 'day');
    } catch (error) { /* private mode */ }
    sync();
  });
  sync();
})();
