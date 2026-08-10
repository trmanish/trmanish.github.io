(() => {
  const root = document.querySelector('[data-diary]');
  const dataNode = document.getElementById('diary-posts');
  if (!root || !dataNode) return;

  /* Posts arrive oldest first, and each spread holds a single post, so the
     diary reads date after date the way a real one fills up. The feature
     spread keeps its own place in that order, and the opening animation
     stops the riffle a few pages past it so the feather can flip back. */
  const posts = JSON.parse(dataNode.textContent);
  const spreads = posts.map((post) => ({
    type: post.title.toLowerCase() === 'love is the only prosperity' ? 'feature' : 'post',
    post
  }));
  const loveIndex = Math.max(0, spreads.findIndex((spread) => spread.type === 'feature'));
  const foundIntro = spreads.findIndex((spread) => spread.post.title.toLowerCase() === 'the last scarce things');
  const introIndex = foundIntro > loveIndex ? foundIntro : Math.min(loveIndex + 1, spreads.length - 1);

  const stage = root.querySelector('[data-diary-stage]');
  const book = root.querySelector('[data-diary-book]');
  const spreadNode = root.querySelector('[data-diary-spread]');
  const turnZones = [...root.querySelectorAll('[data-diary-drag]')];
  const prevButton = root.querySelector('[data-diary-prev]');
  const nextButton = root.querySelector('[data-diary-next]');
  const caption = document.querySelector('[data-diary-caption]');
  const progress = document.querySelector('[data-diary-progress]');
  const hint = document.querySelector('[data-diary-hint]');
  const riffle = root.querySelector('[data-diary-riffle]');
  const feather = root.querySelector('[data-diary-feather]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STRIPS = 18;
  const PEAK_CURL = 0.60;
  const EDGE_BAND = .24;
  let current = 0;
  let turning = false;
  let pointer = null;
  let hintTimer;
  let introActive = false;

  const escapeHtml = (value = '') => value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  /* Every width inside the turning leaf is an absolute length, because the
     strips are nested and a percentage would resolve against the strip above
     it. The book reports its own width here and the CSS divides it up. */
  function measure() {
    book.style.setProperty('--book-w', `${book.clientWidth}px`);
  }
  window.addEventListener('resize', () => { measure(); tuneClamp(); placeFeather(featherPose); });
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => tuneClamp());

  function photoMarkup(post) {
    if (!post.image) {
      return `<div class="memory-page__mark" aria-hidden="true">✢</div>`;
    }
    return `<span class="memory-page__photo"><i class="memory-page__tape" aria-hidden="true"></i><img class="memory-page__image" src="${escapeHtml(post.image)}" alt="" loading="eager" draggable="false"></span>`;
  }

  function pageShell(post, side, extraClass, inner) {
    return `<article class="memory-page memory-page--${side}${extraClass}" data-url="${escapeHtml(post.url)}" tabindex="0" role="link" aria-label="Read ${escapeHtml(post.title)}">
      <div class="memory-page__inner">${inner}</div>
    </article>`;
  }

  function eyebrowMarkup(post, number) {
    return `<p class="memory-page__eyebrow"><span>${escapeHtml(post.date)}</span><span class="memory-page__number">${String(number).padStart(2, '0')}</span></p>`;
  }

  function spreadPages(index) {
    const spread = spreads[index];
    const post = spread.post;
    if (spread.type === 'feature') {
      return {
        left: pageShell(post, 'left', ' memory-page--feature', `
          ${eyebrowMarkup(post, index * 2)}
          ${photoMarkup(post)}
          <h2 class="memory-page__title">${escapeHtml(post.title)}</h2>
          <span class="memory-page__rule" aria-hidden="true"></span>
          <p class="memory-page__excerpt">${escapeHtml(post.excerpt)}</p>
          <span class="memory-page__read">Read this tick &rarr;</span>`),
        right: pageShell(post, 'right', ' memory-page--feature-continuation', `
          <p class="memory-page__eyebrow"><span>${escapeHtml(post.date)}</span><span class="memory-page__number">II</span></p>
          <blockquote class="memory-page__quote">Your fear of getting hurt should never be greater than your courage to love.</blockquote>
          <p class="memory-page__continuation">Love is beautiful, painful, joyful and quiet, yet it forces the best out of us for everyone around us.</p>
          <span class="memory-page__read">Continue reading &rarr;</span>`)
      };
    }
    const bullets = (post.bullets || []).filter(Boolean);
    const asList = bullets.length >= 3;
    const parts = asList
      ? { lead: post.intro || '', rest: '' }
      : splitExcerpt(post.excerpt);
    const quote = asList ? '' : pickQuote(parts.rest);
    const body = asList
      ? `<ul class="memory-page__list">${bullets.slice(0, 10).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : `<p class="memory-page__excerpt">${escapeHtml(parts.rest)}</p>
        ${quote ? `<blockquote class="memory-page__quote memory-page__quote--pull">${escapeHtml(quote)}</blockquote>` : ''}`;
    return {
      left: pageShell(post, 'left', '', `
        ${eyebrowMarkup(post, index * 2)}
        ${photoMarkup(post)}
        <h2 class="memory-page__title">${escapeHtml(post.title)}</h2>
        <span class="memory-page__rule" aria-hidden="true"></span>
        <p class="memory-page__excerpt memory-page__excerpt--lead">${escapeHtml(parts.lead)}</p>`),
      right: pageShell(post, 'right', ' memory-page--body', `
        ${eyebrowMarkup(post, index * 2 + 1)}
        ${body}
        <span class="memory-page__read">Read this tick &rarr;</span>`)
    };
  }

  /* The first few lines of a post sit under its headline on the left page,
     and the right page carries the writing on from that exact word. */
  function splitExcerpt(excerpt = '') {
    if (excerpt.length < 220) return { lead: excerpt, rest: '' };
    const cut = excerpt.lastIndexOf(' ', 165);
    if (cut < 60) return { lead: '', rest: excerpt };
    return { lead: excerpt.slice(0, cut) + '…', rest: '…' + excerpt.slice(cut) };
  }

  /* A sentence from deeper in the post, written across the lower part of the
     right page the way a line worth keeping gets copied out in a diary. */
  function pickQuote(text = '') {
    const sentences = (text.match(/[^.!?…]+[.!?]/g) || [])
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 45 && sentence.length < 180);
    if (!sentences.length) return '';
    const tail = sentences.slice(Math.floor(sentences.length / 2));
    return tail.reduce((best, sentence) => (sentence.length > best.length ? sentence : best), tail[0]);
  }

  function render(index) {
    const pages = spreadPages(index);
    spreadNode.innerHTML = pages.left + pages.right;
    const spread = spreads[index];
    caption.textContent = spread.type === 'feature'
      ? 'Love is the Only Prosperity'
      : `${index + 1} of ${spreads.length} · ${spread.post.title}`;
    progress.style.transform = `scaleX(${(index + 1) / spreads.length})`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === spreads.length - 1;
    if (!introActive) restFeather(index === loveIndex);
    tuneClamp();
    attachPageNavigation();
  }

  /* The pages are a fixed size, so the excerpt gets exactly as many whole
     lines as fit above the read link. Cutting a line in half would break the
     look of a written page. The measured counts go on the shell as CSS
     variables, so the faces built for a turn inherit the same limits. */
  function tuneClamp() {
    spreadNode.querySelectorAll('.memory-page__excerpt:not(.memory-page__excerpt--lead)').forEach((excerpt) => {
      const inner = excerpt.closest('.memory-page__inner');
      const read = inner.querySelector('.memory-page__read');
      const lineHeight = parseFloat(getComputedStyle(excerpt).lineHeight) || 18;
      const innerBottom = inner.getBoundingClientRect().bottom - parseFloat(getComputedStyle(inner).paddingBottom);
      const reserved = read ? read.getBoundingClientRect().height + 12 : 0;
      const available = innerBottom - reserved - excerpt.getBoundingClientRect().top;
      const lines = Math.max(2, Math.floor(available / lineHeight));
      const scope = excerpt.closest('.memory-page--feature') ? '--clamp-feature' : '--clamp-body';
      root.style.setProperty(scope, lines);
    });
  }

  function attachPageNavigation() {
    spreadNode.querySelectorAll('[data-url]').forEach((page) => {
      page.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.href = page.dataset.url;
        }
      });
    });
  }

  /* One parse per side, then clones. A turn builds 36 faces, and parsing the
     same markup 36 times is what made the motion stutter. */
  function template(html) {
    const holder = document.createElement('template');
    holder.innerHTML = html;
    return holder.content;
  }

  function buildFace(fragment, className, stripIndex) {
    const face = document.createElement('div');
    face.className = `diary-face ${className}`;
    face.style.setProperty('--strip-index', stripIndex);
    const page = document.createElement('div');
    page.className = 'diary-face__page';
    page.appendChild(fragment.cloneNode(true));
    face.appendChild(page);
    return face;
  }

  function buildLeaf(direction, targetOverride) {
    const target = targetOverride != null
      ? targetOverride
      : (direction === 'next' ? current + 1 : current - 1);
    const from = spreadPages(current);
    const to = spreadPages(target);
    const frontTemplate = template(direction === 'next' ? from.right : from.left);
    const backTemplate = template(direction === 'next' ? to.left : to.right);
    const leaf = document.createElement('div');
    leaf.className = `diary-leaf diary-leaf--${direction}`;
    const stripList = [];
    let parent = leaf;

    for (let i = 0; i < STRIPS; i += 1) {
      const strip = document.createElement('div');
      strip.className = 'diary-strip';
      strip.appendChild(buildFace(frontTemplate, 'diary-face--front', i));
      strip.appendChild(buildFace(backTemplate, 'diary-face--back', i));
      parent.appendChild(strip);
      parent = strip;
      stripList.push(strip);
    }

    spreadNode.innerHTML = direction === 'next'
      ? from.left + to.right
      : to.left + from.right;
    book.classList.remove('is-turning-next', 'is-turning-prev');
    book.classList.add(`is-turning-${direction}`);
    book.appendChild(leaf);
    return { leaf, strips: stripList, target, direction, amount: 0 };
  }

  function setTurn(turnState, amount) {
    const t = Math.max(0, Math.min(1, amount));
    const theta = Math.PI * t;
    const beta = PEAK_CURL * Math.sin(Math.PI * t);
    const degrees = 180 / Math.PI;
    const rootAngle = theta + beta;
    const stripAngle = 2 * beta / STRIPS;
    const shade = Math.sin(Math.PI * t);
    turnState.amount = t;
    turnState.leaf.style.setProperty('--turn', `${(rootAngle * degrees).toFixed(2)}deg`);
    turnState.leaf.style.setProperty('--step', `${(stripAngle * degrees).toFixed(3)}deg`);
    turnState.leaf.style.setProperty('--shade', shade.toFixed(3));
    root.style.setProperty('--turn-shade', shade.toFixed(3));

    turnState.strips.forEach((strip, index) => {
      const nearLight = Math.abs(Math.cos(rootAngle - index * stripAngle));
      const farLight = Math.abs(Math.cos(rootAngle - (index + 1) * stripAngle));
      strip.style.setProperty('--lit', nearLight.toFixed(3));
      strip.style.setProperty('--a1', ((1 - nearLight) * .62).toFixed(3));
      strip.style.setProperty('--a2', ((1 - farLight) * .62).toFixed(3));
    });
  }

  function finishTurn(state, committed) {
    if (committed) current = state.target;
    state.leaf.remove();
    book.classList.remove('is-turning-next', 'is-turning-prev');
    root.style.setProperty('--turn-shade', '0');
    turning = false;
    render(current);
  }

  function settleTurn(state, committed, initialVelocity = 0) {
    if (reducedMotion) {
      setTurn(state, committed ? 1 : 0);
      finishTurn(state, committed);
      return;
    }
    const target = committed ? 1 : 0;
    const stiffness = committed ? 170 : 150;
    const damping = committed ? 26 : 24;
    let velocity = initialVelocity;
    let value = state.amount;
    let last = performance.now();

    function frame(now) {
      const dt = Math.min(.032, (now - last) / 1000 || .016);
      last = now;
      const displacement = value - target;
      velocity += (-stiffness * displacement - damping * velocity) * dt;
      value += velocity * dt;
      setTurn(state, value);
      if (Math.abs(value - target) < .002 && Math.abs(velocity) < .02) {
        setTurn(state, target);
        finishTurn(state, committed);
      } else {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  }

  function canTurn(direction) {
    return direction === 'next' ? current < spreads.length - 1 : current > 0;
  }

  function animateTurn(direction) {
    if (introActive || turning || !canTurn(direction)) return;
    turning = true;
    dismissHint();
    const state = buildLeaf(direction);
    setTurn(state, 0);
    settleTurn(state, true);
  }

  function dismissHint() {
    clearTimeout(hintTimer);
    hint.classList.add('is-gone');
  }

  /* A press anywhere on a half picks that page up. A press that never moves
     is a click: on the outer edge it turns the page, and anywhere else it
     opens the essay printed on it. */
  function beginDrag(event) {
    if (introActive || turning || event.button !== 0) return;
    const zone = event.currentTarget;
    const direction = zone.dataset.diaryDrag;
    const bounds = zone.getBoundingClientRect();
    const acrossZone = (event.clientX - bounds.left) / bounds.width;
    const onEdge = direction === 'next' ? acrossZone > 1 - EDGE_BAND : acrossZone < EDGE_BAND;
    const page = spreadNode.querySelector(direction === 'next' ? '.memory-page--right' : '.memory-page--left');
    const url = page ? page.dataset.url : null;
    const now = performance.now();
    pointer = {
      id: event.pointerId, startX: event.clientX, state: null, amount: 0,
      velocity: 0, previousAmount: 0, previousTime: now, moved: 0, onEdge, url, direction
    };
    if (canTurn(direction)) {
      pointer.state = buildLeaf(direction);
      setTurn(pointer.state, 0);
      resetLean();
      turning = true;
    }
    try { zone.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointers */ }
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer.moved = Math.max(pointer.moved, Math.abs(event.clientX - pointer.startX));
    if (!pointer.state) return;
    const bounds = book.getBoundingClientRect();
    const delta = pointer.direction === 'next' ? pointer.startX - event.clientX : event.clientX - pointer.startX;
    const amount = Math.max(0, Math.min(1, delta / (bounds.width * .62)));
    const now = performance.now();
    pointer.velocity = (amount - pointer.previousAmount) / Math.max(.001, (now - pointer.previousTime) / 1000);
    pointer.previousAmount = amount;
    pointer.previousTime = now;
    pointer.amount = amount;
    setTurn(pointer.state, pointer.amount);
  }

  function endDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const drag = pointer;
    pointer = null;
    dismissHint();
    const tapped = drag.moved < 6;
    if (tapped && !drag.onEdge && drag.url) {
      if (drag.state) {
        setTurn(drag.state, 0);
        finishTurn(drag.state, false);
      }
      window.location.href = drag.url;
      return;
    }
    if (!drag.state) return;
    const commit = tapped || drag.amount > .42 || drag.velocity > 1.1;
    settleTurn(drag.state, commit, drag.velocity);
  }

  /* The riffle: a fast overlapping cascade of pages sweeping right to left,
     each carrying real writing. The leaves are driven frame by frame with
     plain transforms. A CSS keyframe animation with a filter in it made
     Safari's compositor rasterize the page content at the wrong scale, so
     no filter, no CSS animation and no backface layers are used here. */
  function makeRiffle() {
    if (reducedMotion) return;
    const leaves = [];
    for (let i = 0; i < 5; i += 1) {
      const leaf = document.createElement('div');
      leaf.className = 'diary-riffle__leaf';
      const sample = Math.min(spreads.length - 1, Math.max(1, Math.round((i + 1) * introIndex / 6)));
      const page = document.createElement('div');
      page.className = 'diary-riffle__page';
      page.innerHTML = spreadPages(sample).right.replace(/tabindex="0"/g, 'tabindex="-1"');
      leaf.appendChild(page);
      riffle.appendChild(leaf);
      leaves.push({ leaf, page, start: 180 + i * 105, duration: 1100, done: false });
    }
    const began = performance.now();
    function frame(now) {
      let alive = false;
      leaves.forEach((item) => {
        if (item.done) return;
        const t = (now - began - item.start) / item.duration;
        if (t < 0) { alive = true; return; }
        const k = Math.min(1, t);
        const eased = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        item.leaf.style.transform = `rotateY(${(-180 * eased).toFixed(2)}deg) skewY(${(-eased).toFixed(2)}deg)`;
        if (k >= 1) { item.done = true; item.leaf.remove(); }
        else alive = true;
      });
      if (alive) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- the feather */
  /* Anchors are the point of the quill that touches the paper, in fractions
     of the book. The feather is placed so that point lands on them. */
  const ANCHOR = {
    start: { x: -.46, y: .16 },
    hit: { x: .055, y: .48 },
    rest: { x: .84, y: .86 }
  };
  let featherPose = { x: ANCHOR.rest.x, y: ANCHOR.rest.y, rotate: 16, tilt: 0, height: 0, opacity: 0 };

  function placeFeather(pose) {
    if (!feather) return;
    featherPose = pose;
    const width = feather.offsetWidth || book.clientWidth * .24;
    const height = feather.offsetHeight || width * .667;
    const x = pose.x * book.clientWidth - width * .76;
    const y = pose.y * book.clientHeight - height * .60;
    feather.style.transform =
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` +
      ` rotate(${pose.rotate.toFixed(1)}deg) rotateY(${pose.tilt.toFixed(1)}deg)` +
      ` scale(${(1 + pose.height * .16).toFixed(3)})`;
    feather.style.opacity = pose.opacity.toFixed(3);
    feather.style.setProperty('--h', pose.height.toFixed(3));
  }

  function restFeather(visible) {
    placeFeather({ ...ANCHOR.rest, rotate: 16, tilt: 0, height: 0, opacity: visible ? 1 : 0 });
  }

  function flyFeather(from, to, duration, options, done) {
    if (reducedMotion) { restFeather(true); done && done(); return; }
    const sway = options.sway;
    const cycles = options.cycles;
    const started = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - started) / duration);
      const glide = .5 - Math.cos(Math.PI * t) / 2;
      const settle = 1 - Math.pow(1 - t, 1.7);
      const wave = Math.sin(t * Math.PI * 2 * cycles + options.phase);
      const fade = 1 - t;
      const wobble = sway * wave * fade;
      placeFeather({
        x: from.x + (to.x - from.x) * glide + (options.swayAxis === 'y' ? 0 : wobble),
        y: from.y + (to.y - from.y) * (options.arc ? glide : settle)
          - (options.arc || 0) * Math.sin(Math.PI * t)
          + (options.swayAxis === 'y' ? wobble : 0),
        rotate: options.rotateFrom + (options.rotateTo - options.rotateFrom) * glide + options.rock * wave * fade,
        tilt: options.tilt * Math.cos(t * Math.PI * 2 * cycles) * fade,
        height: options.liftFrom + (options.liftTo - options.liftFrom) * glide + (options.hop || 0) * Math.sin(Math.PI * t),
        opacity: Math.min(1, t / .12)
      });
      if (t < 1) requestAnimationFrame(frame);
      else done && done();
    }
    requestAnimationFrame(frame);
  }

  function tweenIntroTurn(state, duration, done) {
    const from = state.amount;
    const started = performance.now();
    function frame(now) {
      const step = Math.min(1, (now - started) / duration);
      const eased = .5 - Math.cos(Math.PI * step) / 2;
      setTurn(state, from + (1 - from) * eased);
      if (step < 1) requestAnimationFrame(frame);
      else {
        finishTurn(state, true);
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  /* The riffle settles with the last page still slightly lifted, the feather
     drifts in from the left of the screen, touches that bent page, and the
     touch pushes the page over to open the feature spread. */
  function runOpeningStory() {
    if (reducedMotion || spreads.length < 2 || introIndex <= loveIndex) {
      current = loveIndex;
      introActive = false;
      render(current);
      restFeather(true);
      return;
    }
    introActive = true;
    current = 0;
    render(current);
    restFeather(false);
    makeRiffle();
    let bentLeaf = null;

    /* The riffle is still sweeping past when the diary lands on the stop
       page, so the change of spread hides inside the motion. */
    setTimeout(() => {
      current = introIndex;
      render(current);
      turning = true;
      bentLeaf = buildLeaf('prev', loveIndex);
      setTurn(bentLeaf, .11);
    }, 1500);

    setTimeout(() => {
      feather.classList.add('diary-feather--under');
      flyFeather(ANCHOR.start, ANCHOR.hit, 2150, {
        sway: .055, swayAxis: 'y', cycles: 1.6, phase: .3, rock: 22, tilt: 26,
        rotateFrom: -64, rotateTo: -24, liftFrom: 1, liftTo: .04
      }, turnOnContact);
    }, 2050);

    function turnOnContact() {
      if (!bentLeaf) return;
      /* The feather slid in under the lifted page, so it stays beneath the
         book until the turning page has risen clear of it. */
      setTimeout(() => feather.classList.remove('diary-feather--under'), 520);
      tweenIntroTurn(bentLeaf, 1650, () => {
        introActive = false;
        restFeather(true);
        caption.textContent = 'Love is the Only Prosperity';
      });
      setTimeout(() => {
        flyFeather(ANCHOR.hit, ANCHOR.rest, 1350, {
          sway: .025, swayAxis: 'y', cycles: .8, phase: 0, rock: 8, tilt: 40, arc: .09,
          rotateFrom: -24, rotateTo: 16, liftFrom: .04, liftTo: 0, hop: .55
        });
      }, 330);
    }
  }

  function leanBook(event) {
    if (pointer || turning || !window.matchMedia('(pointer: fine)').matches) return;
    const bounds = stage.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - .5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - .5) * 2;
    book.style.setProperty('--lean-x', `${(-y * 3.5).toFixed(2)}deg`);
    book.style.setProperty('--lean-y', `${(x * 5.5).toFixed(2)}deg`);
  }

  function resetLean() {
    book.style.setProperty('--lean-x', '0deg');
    book.style.setProperty('--lean-y', '0deg');
  }

  prevButton.addEventListener('click', () => animateTurn('prev'));
  nextButton.addEventListener('click', () => animateTurn('next'));
  turnZones.forEach((zone) => {
    zone.addEventListener('pointerdown', beginDrag);
    zone.addEventListener('pointermove', moveDrag);
    zone.addEventListener('pointerup', endDrag);
    zone.addEventListener('pointercancel', endDrag);
    zone.addEventListener('click', (event) => {
      if (event.detail === 0) animateTurn(zone.dataset.diaryDrag);
    });
  });
  stage.addEventListener('pointermove', leanBook);
  stage.addEventListener('pointerleave', resetLean);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') animateTurn('next');
    if (event.key === 'ArrowLeft') animateTurn('prev');
  });

  runOpeningStory();
  hintTimer = setTimeout(dismissHint, 9000);
})();
