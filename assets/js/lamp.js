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
    dismissNote();
    sync();
  });
  sync();

  // The same wind that turns the pages brushes the lantern: it sways once
  // during the opening, then an occasional draft touches it again. Motion is
  // the quiet way of saying "this is a real thing you can reach for."
  function sway() {
    button.classList.remove('is-swaying');
    void button.offsetWidth;
    button.classList.add('is-swaying');
  }
  button.addEventListener('animationend', () => button.classList.remove('is-swaying'));
  setTimeout(sway, 1300);
  setInterval(sway, 64000);

  // A one-time handwritten margin note under the lantern, like something the
  // diary's owner scribbled. It fades in after the opening settles, fades
  // away on its own, and never returns once seen or once the lamp is lit.
  const NOTE_KEY = 'twoticks-lantern-note';
  let note = null;
  let noteSeen = 'seen';
  try { noteSeen = localStorage.getItem(NOTE_KEY); } catch (error) { /* private mode */ }
  function dismissNote() {
    try { localStorage.setItem(NOTE_KEY, 'seen'); } catch (error) { /* private mode */ }
    if (!note) return;
    note.classList.remove('is-visible');
    const gone = note;
    note = null;
    setTimeout(() => gone.remove(), 1300);
  }
  if (!noteSeen && document.body.classList.contains('diary-home') && !document.body.classList.contains('is-night')) {
    note = document.createElement('div');
    note.className = 'lantern-note';
    note.setAttribute('aria-hidden', 'true');
    note.innerHTML = '<svg viewBox="0 0 30 34"><path d="M6 32 C 16 28, 22 18, 21 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M21 4 L15.5 8.5 M21 4 L24.5 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>light the lantern';
    document.body.appendChild(note);
    setTimeout(() => { if (note) note.classList.add('is-visible'); }, 12000);
    setTimeout(dismissNote, 20500);
  }
})();
