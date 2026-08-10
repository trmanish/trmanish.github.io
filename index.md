---
layout: home
title: "Two Ticks"
class: "home-page"
---

<section class="diary-hero" aria-labelledby="diary-heading">
  <p class="diary-kicker">Life, two ticks at a time</p>
  <h1 id="diary-heading" class="visually-hidden">Two Ticks — Essays and memories</h1>

  <blockquote class="diary-home-quote diary-home-quote--above">
    In the end, we realize, that Artificial Intelligence is not a threat to Society. Natural Stupidity of Humans is.
  </blockquote>

  <div class="diary-shell" data-diary>
    <button class="diary-arrow diary-arrow--prev" type="button" aria-label="Turn to the previous pages" data-diary-prev>
      <span aria-hidden="true">&#8592;</span>
    </button>

    <div class="diary-stage" data-diary-stage>
      <div class="diary-book" data-diary-book aria-live="polite">
        <div class="diary-cover" aria-hidden="true"></div>
        <div class="diary-page-stack diary-page-stack--left" aria-hidden="true"></div>
        <div class="diary-page-stack diary-page-stack--right" aria-hidden="true"></div>
        <div class="diary-spread" data-diary-spread></div>
        <button class="diary-turn-zone diary-turn-zone--left" type="button" aria-label="Drag or tap to turn to the previous pages" data-diary-drag="prev"></button>
        <button class="diary-turn-zone diary-turn-zone--right" type="button" aria-label="Drag or tap to turn to the next pages" data-diary-drag="next"></button>
        <div class="diary-gutter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="diary-riffle" data-diary-riffle aria-hidden="true"></div>
        <img class="diary-feather is-hidden" src="{{ '/assets/images/diary/memory-feather.webp' | relative_url }}" alt="" data-diary-feather aria-hidden="true">
      </div>
    </div>

    <button class="diary-arrow diary-arrow--next" type="button" aria-label="Turn to the next pages" data-diary-next>
      <span aria-hidden="true">&#8594;</span>
    </button>
  </div>

  <div class="diary-meta">
    <p data-diary-caption>Open the diary</p>
    <div class="diary-progress" aria-hidden="true"><span data-diary-progress></span></div>
    <p class="diary-hint" data-diary-hint>Drag or tap a page edge to turn &middot; click the center to read</p>
  </div>

  <blockquote class="diary-home-quote diary-home-quote--below">
    Life is static. It doesn't unfold or move. It appears to pass by Two Ticks at a time. Yet, It's a constant. It's just us who feel it change.
  </blockquote>

  <noscript>
    <p class="diary-noscript">The diary needs JavaScript to turn its pages. <a href="{{ '/posts.html' | relative_url }}">Browse all essays</a>.</p>
  </noscript>
</section>

<script id="diary-posts" type="application/json">
[
{% for post in site.posts %}
  {
    "title": {{ post.title | jsonify }},
    "url": {{ post.url | relative_url | jsonify }},
    "date": {{ post.date | date: "%B %d, %Y" | jsonify }},
    "excerpt": {{ post.content | strip_html | strip_newlines | normalize_whitespace | replace: post.title, "" | truncate: 300 | jsonify }},
    "image": {% if post.image %}{{ post.image | relative_url | jsonify }}{% else %}""{% endif %}
  }{% unless forloop.last %},{% endunless %}
{% endfor %}
]
</script>
