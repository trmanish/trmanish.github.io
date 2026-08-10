(() => {
  const root = document.querySelector('[data-diary]');
  const dataNode = document.getElementById('diary-posts');
  if (!root || !dataNode) return;

  const posts = JSON.parse(dataNode.textContent);
  const featureIndex = posts.findIndex((post) => post.title.toLowerCase() === 'love is the only prosperity');
  const feature = featureIndex >= 0 ? posts.splice(featureIndex, 1)[0] : posts.shift();
  const spreads = [{ type: 'feature', left: feature, right: feature }];
  for (let i = 0; i < posts.length; i += 2) {
    spreads.push({ type: 'posts', left: posts[i], right: posts[i + 1] || null });
  }

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
  let current = 0;
  let turning = false;
  let pointer = null;
  let hintTimer;
  let introActive = false;

  const escapeHtml = (value = '') => value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  function pageMarkup(post, side, options = {}) {
    if (!post) {
      return `<article class="memory-page memory-page--${side}" aria-hidden="true"><div class="memory-page__inner"></div></article>`;
    }
    const featureClass = options.feature ? ' memory-page--feature' : '';
    const continuationClass = options.continuation ? ' memory-page--feature-continuation' : '';
    if (options.continuation) {
      return `<article class="memory-page memory-page--${side}${continuationClass}" data-url="${escapeHtml(post.url)}" tabindex="0" role="link" aria-label="Read ${escapeHtml(post.title)}">
        <div class="memory-page__inner">
          <p class="memory-page__eyebrow"><span>${escapeHtml(post.date)}</span><span class="memory-page__number">II</span></p>
          <blockquote class="memory-page__quote">Your fear of getting hurt should never be greater than your courage to love.</blockquote>
          <p class="memory-page__continuation">Love is beautiful, painful, joyful and quiet—yet it forces the best out of us for everyone around us.</p>
          <span class="memory-page__read">Continue reading &rarr;</span>
        </div>
      </article>`;
    }
    const visual = post.image
      ? `<img class="memory-page__image" src="${escapeHtml(post.image)}" alt="" loading="eager">`
      : `<div class="memory-page__mark" aria-hidden="true">${side === 'left' ? '✢' : '❦'}</div>`;
    return `<article class="memory-page memory-page--${side}${featureClass}" data-url="${escapeHtml(post.url)}" tabindex="0" role="link" aria-label="Read ${escapeHtml(post.title)}">
      <div class="memory-page__inner">
        <p class="memory-page__eyebrow"><span>${escapeHtml(post.date)}</span><span class="memory-page__number">${String(options.number || 1).padStart(2, '0')}</span></p>
        ${visual}
        <h2 class="memory-page__title">${escapeHtml(post.title)}</h2>
        <span class="memory-page__rule" aria-hidden="true"></span>
        <p class="memory-page__excerpt">${escapeHtml(post.excerpt)}</p>
        <span class="memory-page__read">Read this tick &rarr;</span>
      </div>
    </article>`;
  }

  function spreadPages(index) {
    const spread = spreads[index];
    if (spread.type === 'feature') {
      return {
        left: pageMarkup(spread.left, 'left', { feature: true, number: 1 }),
        right: pageMarkup(spread.right, 'right', { continuation: true })
      };
    }
    return {
      left: pageMarkup(spread.left, 'left', { number: index * 2 }),
      right: pageMarkup(spread.right, 'right', { number: index * 2 + 1 })
    };
  }

  function render(index) {
    const pages = spreadPages(index);
    spreadNode.innerHTML = pages.left + pages.right;
    const spread = spreads[index];
    caption.textContent = spread.type === 'feature'
      ? 'Love is the Only Prosperity'
      : `${index + 1} of ${spreads.length} · ${spread.left.title}${spread.right ? ` / ${spread.right.title}` : ''}`;
    progress.style.transform = `scaleX(${(index + 1) / spreads.length})`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === spreads.length - 1;
    turnZones.forEach((zone) => {
      zone.disabled = (zone.dataset.diaryDrag === 'prev' && index === 0) ||
        (zone.dataset.diaryDrag === 'next' && index === spreads.length - 1);
    });
    if (!introActive && feather) {
      feather.className = `diary-feather ${index === 0 ? 'is-resting' : 'is-hidden'}`;
    }
    attachPageNavigation();
  }

  function attachPageNavigation() {
    spreadNode.querySelectorAll('[data-url]').forEach((page) => {
      page.addEventListener('click', () => { window.location.href = page.dataset.url; });
      page.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.href = page.dataset.url;
        }
      });
    });
  }

  function buildFace(pageHtml, className, stripIndex) {
    const face = document.createElement('div');
    face.className = `diary-face ${className}`;
    face.style.setProperty('--strip-index', stripIndex);
    const page = document.createElement('div');
    page.className = 'diary-face__page';
    page.innerHTML = pageHtml;
    face.appendChild(page);
    return face;
  }

  function buildLeaf(direction) {
    const target = direction === 'next' ? current + 1 : current - 1;
    const from = spreadPages(current);
    const to = spreadPages(target);
    const leaf = document.createElement('div');
    leaf.className = `diary-leaf diary-leaf--${direction}`;
    leaf.style.setProperty('--strips', STRIPS);
    const stripList = [];
    let parent = leaf;

    for (let i = 0; i < STRIPS; i += 1) {
      const strip = document.createElement('div');
      strip.className = 'diary-strip';
      const frontHtml = direction === 'next' ? from.right : from.left;
      const backHtml = direction === 'next' ? to.left : to.right;
      strip.appendChild(buildFace(frontHtml, 'diary-face--front', i));
      strip.appendChild(buildFace(backHtml, 'diary-face--back', i));
      parent.appendChild(strip);
      parent = strip;
      stripList.push(strip);
    }

    const targetPages = spreadPages(target);
    spreadNode.innerHTML = direction === 'next'
      ? from.left + targetPages.right
      : targetPages.left + from.right;
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
    const rootAngle = (theta + beta) * degrees;
    const stripAngle = (2 * beta / STRIPS) * degrees;
    const shade = Math.sin(Math.PI * t);
    turnState.amount = t;
    turnState.leaf.style.setProperty('--turn', `${rootAngle.toFixed(2)}deg`);
    turnState.leaf.style.setProperty('--step', `${stripAngle.toFixed(3)}deg`);
    turnState.leaf.style.setProperty('--shade', shade.toFixed(3));
    book.style.setProperty('--turn-shade', shade.toFixed(3));

    turnState.strips.forEach((strip, index) => {
      const nearLight = Math.abs(Math.cos(rootAngle / degrees - index * stripAngle / degrees));
      const farLight = Math.abs(Math.cos(rootAngle / degrees - (index + 1) * stripAngle / degrees));
      strip.style.setProperty('--lit', nearLight.toFixed(3));
      strip.style.setProperty('--a1', ((1 - nearLight) * .62).toFixed(3));
      strip.style.setProperty('--a2', ((1 - farLight) * .62).toFixed(3));
    });
  }

  function finishTurn(state, committed) {
    if (committed) current = state.target;
    state.leaf.remove();
    book.classList.remove('is-turning-next', 'is-turning-prev');
    book.style.setProperty('--turn-shade', '0');
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

  function animateTurn(direction) {
    if (introActive || turning || (direction === 'next' && current >= spreads.length - 1) || (direction === 'prev' && current <= 0)) return;
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

  function beginDrag(event) {
    if (introActive || turning || event.button !== 0) return;
    const direction = event.currentTarget.dataset.diaryDrag;
    if ((direction === 'next' && current >= spreads.length - 1) || (direction === 'prev' && current <= 0)) return;
    const state = buildLeaf(direction);
    setTurn(state, 0);
    resetLean();
    const now = performance.now();
    pointer = { id: event.pointerId, startX: event.clientX, state, amount: 0, velocity: 0, previousAmount: 0, previousTime: now, moved: 0 };
    turning = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const bounds = book.getBoundingClientRect();
    const delta = pointer.state.direction === 'next' ? pointer.startX - event.clientX : event.clientX - pointer.startX;
    const amount = Math.max(0, Math.min(1, delta / (bounds.width * .62)));
    const now = performance.now();
    pointer.moved = Math.max(pointer.moved, Math.abs(event.clientX - pointer.startX));
    pointer.velocity = (amount - pointer.previousAmount) / Math.max(.001, (now - pointer.previousTime) / 1000);
    pointer.previousAmount = amount;
    pointer.previousTime = now;
    pointer.amount = amount;
    setTurn(pointer.state, pointer.amount);
  }

  function endDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const drag = pointer;
    const commit = drag.moved < 6 || drag.amount > .42 || drag.velocity > 1.1;
    pointer = null;
    settleTurn(drag.state, commit, drag.velocity);
  }

  function makeRiffle() {
    if (reducedMotion) return;
    for (let i = 0; i < 5; i += 1) {
      const leaf = document.createElement('i');
      leaf.className = 'diary-riffle__leaf';
      leaf.style.setProperty('--delay', `${180 + i * 105}ms`);
      leaf.addEventListener('animationend', () => leaf.remove());
      riffle.appendChild(leaf);
    }
  }

  function tweenIntroTurn(state, duration, done) {
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / duration);
      const eased = .5 - Math.cos(Math.PI * progress) / 2;
      setTurn(state, eased);
      if (progress < 1) requestAnimationFrame(frame);
      else {
        finishTurn(state, true);
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  function runOpeningStory() {
    if (reducedMotion || spreads.length < 2) {
      current = 0;
      introActive = false;
      render(current);
      feather.className = 'diary-feather is-resting';
      return;
    }
    introActive = true;
    root.classList.add('is-intro-story');
    current = 1;
    render(current);
    makeRiffle();

    setTimeout(() => {
      feather.className = 'diary-feather is-falling';
    }, 2050);

    setTimeout(() => {
      feather.className = 'diary-feather is-landed-left';
    }, 3650);

    setTimeout(() => {
      if (turning) return;
      turning = true;
      feather.className = 'diary-feather is-crossing';
      const state = buildLeaf('prev');
      setTurn(state, 0);
      tweenIntroTurn(state, 1750, () => {
        introActive = false;
        root.classList.remove('is-intro-story');
        feather.className = 'diary-feather is-resting';
        caption.textContent = 'Love is the Only Prosperity';
      });
    }, 4200);
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
