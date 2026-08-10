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
  const prevButton = root.querySelector('[data-diary-prev]');
  const nextButton = root.querySelector('[data-diary-next]');
  const caption = document.querySelector('[data-diary-caption]');
  const progress = document.querySelector('[data-diary-progress]');
  const hint = document.querySelector('[data-diary-hint]');
  const riffle = root.querySelector('[data-diary-riffle]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STRIPS = 12;
  let current = 0;
  let turning = false;
  let pointer = null;
  let hintTimer;

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
          <p class="memory-page__eyebrow"><span>A remembered truth</span><span class="memory-page__number">II</span></p>
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
        <p class="memory-page__eyebrow"><span>${options.feature ? 'A memory to begin' : escapeHtml(post.date)}</span><span class="memory-page__number">${String(options.number || 1).padStart(2, '0')}</span></p>
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
    }
    book.appendChild(leaf);
    return { leaf, target, direction };
  }

  function setTurn(turnState, amount) {
    const eased = Math.max(0, Math.min(1, amount));
    const curl = Math.sin(eased * Math.PI) * 32;
    const total = eased * 180;
    turnState.leaf.style.setProperty('--turn', `${Math.max(0, total - curl)}deg`);
    turnState.leaf.style.setProperty('--step', `${curl / (STRIPS - 1)}deg`);
    turnState.leaf.style.setProperty('--shade', Math.sin(eased * Math.PI).toFixed(3));
    turnState.leaf.style.setProperty('--highlight', Math.sin(eased * Math.PI * .92).toFixed(3));

    const targetPages = spreadPages(turnState.target);
    if (turnState.direction === 'next') {
      spreadNode.innerHTML = fromLeft(current) + targetPages.right;
    } else {
      spreadNode.innerHTML = targetPages.left + fromRight(current);
    }
  }

  const fromLeft = (index) => spreadPages(index).left;
  const fromRight = (index) => spreadPages(index).right;

  function animateTurn(direction, start = 0, commit = true) {
    if (turning || (direction === 'next' && current >= spreads.length - 1) || (direction === 'prev' && current <= 0)) return;
    turning = true;
    dismissHint();
    const state = buildLeaf(direction);
    const end = commit ? 1 : 0;
    const duration = reducedMotion ? 1 : 620 * Math.abs(end - start);
    const started = performance.now();

    function frame(now) {
      const elapsed = Math.min(1, (now - started) / Math.max(duration, 1));
      const easedTime = 1 - Math.pow(1 - elapsed, 3);
      const amount = start + (end - start) * easedTime;
      setTurn(state, amount);
      if (elapsed < 1) requestAnimationFrame(frame);
      else {
        if (commit) current = state.target;
        state.leaf.remove();
        turning = false;
        render(current);
      }
    }
    requestAnimationFrame(frame);
  }

  function dismissHint() {
    clearTimeout(hintTimer);
    hint.classList.add('is-gone');
  }

  function beginDrag(event) {
    if (turning || event.button !== 0) return;
    const bounds = book.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const direction = localX > bounds.width / 2 ? 'next' : 'prev';
    if ((direction === 'next' && current >= spreads.length - 1) || (direction === 'prev' && current <= 0)) return;
    const state = buildLeaf(direction);
    const activeSpread = spreads[current];
    const activePost = direction === 'next' ? activeSpread.right : activeSpread.left;
    pointer = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, startTime: performance.now(), state, amount: 0, clickUrl: activePost && activePost.url };
    turning = true;
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const bounds = book.getBoundingClientRect();
    const delta = pointer.state.direction === 'next' ? pointer.startX - event.clientX : event.clientX - pointer.startX;
    pointer.amount = Math.max(0, Math.min(1, delta / (bounds.width * .43)));
    pointer.lastX = event.clientX;
    setTurn(pointer.state, pointer.amount);
  }

  function endDrag(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const drag = pointer;
    const travel = Math.abs(event.clientX - drag.startX);
    const velocity = Math.abs(event.clientX - drag.startX) / Math.max(1, performance.now() - drag.startTime);
    const commit = drag.amount > .38 || (drag.amount > .08 && velocity > .55);
    pointer = null;
    turning = false;
    drag.state.leaf.remove();
    render(current);
    if (travel < 7 && drag.clickUrl) {
      window.location.href = drag.clickUrl;
    } else if (commit) {
      animateTurn(drag.state.direction, drag.amount, true);
    }
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
    setTimeout(() => { caption.textContent = 'Love is the Only Prosperity'; }, 1200);
  }

  prevButton.addEventListener('click', () => animateTurn('prev'));
  nextButton.addEventListener('click', () => animateTurn('next'));
  stage.addEventListener('pointerdown', beginDrag);
  stage.addEventListener('pointermove', moveDrag);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') animateTurn('next');
    if (event.key === 'ArrowLeft') animateTurn('prev');
  });

  render(current);
  makeRiffle();
  hintTimer = setTimeout(dismissHint, 9000);
})();
