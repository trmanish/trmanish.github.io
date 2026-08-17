---
name: blog-to-pdf
description: >-
  Convert a post from THIS blog (trmanish.github.io / "Two Ticks") into a PDF
  that visually matches the live blog page exactly — same worn-paper colour and
  grain, Merriweather body, Playfair headings, date placement, pull-quote
  panels, and loose-list spacing. Use ONLY for posts in this
  repo's _posts/ directory. Do NOT use for arbitrary markdown-to-PDF conversion
  (use the general md-to-pdf skill for that). Triggers: "make a pdf of this
  post", "blog to pdf", "pdf of <post title>", "convert this article to pdf".
---

# Blog → PDF (trmanish.github.io)

Produce a PDF that is a faithful print replica of the live blog article. The
blog is a customized Jekyll/Minima site; its look is defined by
`assets/css/style.css` and `_layouts/post.html`. This skill hard-codes those
settings so the PDF matches without re-deriving them each time.

**Scope guard:** This skill is ONLY for converting posts in this repo's
`_posts/` folder. For any other markdown → PDF need, use the general
`md-to-pdf` skill instead. Do not generalize this skill.

## Method 1 (PREFERRED): print the live page with the lantern lit

Manish confirmed on 2026-08-17 that this is the style he wants: "keep a note of
this pdf style.. this is good". Do this first. Only fall back to Method 2 if the
post is not yet live.

Do NOT rebuild the page's look in hand-written CSS. Load the real published page
in Chrome and print it, so the PDF carries the actual masthead, nav, lit lantern,
fonts, glow and footer rather than an approximation. He rejected a hand-built
reconstruction outright, so re-deriving the styling is the wrong instinct here.

Use `render-live.mjs`, in this skill's directory:

```bash
cd <scratchpad>
ln -sfn "$(find /Users/manish/.npm/_npx -maxdepth 3 -type d -name node_modules \
  -path '*puppeteer*' -prune -o -maxdepth 3 -type d -name node_modules -print \
  | head -1)" node_modules          # ESM ignores NODE_PATH, so symlink instead
node <skill>/render-live.mjs <live-post-url> <output.pdf>
```

Key points, each learned the hard way:
- The lantern is lit by seeding `localStorage['twoticks-lamp'] = 'night'` on the
  origin BEFORE navigating to the post, so `lamp.js` applies `.is-night` itself.
- `page.emulateMediaType('screen')` is essential. Print media reverts the page to
  white and throws away the whole dark theme.
- `printBackground: true`, margins 0, and `scale` ~0.72 for a 1200px viewport.
- Verify before printing that `document.body.classList.contains('is-night')` is
  true and the background computes to `rgb(25, 19, 9)`. Do not assume it worked.
- The post must actually be live (HTTP 200); check first.
- Known artifacts: `position: fixed` puts a clipped lantern at the top of later
  pages, and a narrower viewport gives larger text but more pages.

## Method 2 (FALLBACK): rebuild in CSS, for posts not yet published

Everything below reconstructs the page by hand. It produces the day theme only
and omits the masthead, lantern and desk. Use it only when Method 1 cannot run.

## The source of truth (do not guess — mirror these)

The article page is a sheet of worn paper on a desk. In the PDF the page IS the
sheet, so the sheet's colour and grain fill the whole page (the desk wash, the
fixed masthead, the torn `clip-path` edges and the lantern do not belong in a
print and are deliberately left out; `clip-path` in particular would slice every
page, not just the first).

From `assets/css/style.css`, `body.site-page--post .article-paper`:
- Body font `Merriweather` (300;400;700), ink `#342b23`, `font-size: 15.5px`,
  `line-height: 1.76`, max width 800px.
- Paper: `rgba(251,249,243,.97)` plus the three background layers (two dot
  gradients and a 4px ruling), `background-size: 47px 43px, 59px 61px, 100% 4px`.
- Headings `Playfair Display`, colour `#30271f`, `line-height: 1.2`; `h1` renders
  at its clamp ceiling, `44px`.
- Images: `filter: sepia(.04) saturate(.96)`, `box-shadow: 0 8px 22px rgba(63,39,19,.15)`,
  no border, no radius. `.post-hero-image--short` keeps its wide crop
  (`object-fit: cover; object-position: center 46%`).
- Pull quotes are the inline `background-color: #fcfcfc` divs, restyled to
  `rgba(246,242,232,.72)` parchment, Merriweather italic, `1.24em`, uneven
  corner radius. Add `page-break-inside: avoid` so a panel never splits.
- The date is `<p class="article-date">`: Geist, 11px, uppercase,
  `letter-spacing: .14em`, colour `rgba(52,43,35,.56)`, `margin: 0 0 32px`.

From `_layouts/post.html` the date prints first, then the post body, which
supplies its own centred title, hero image and italic byline. Bullet lists use
blank lines between items (a **loose list**), which gives the generous spacing —
preserve it, and do not add `p`/`li` margin overrides.

## Workflow

1. **Read the post** in `_posts/` you're converting. Note its `date:` (format
   it as `Month DD, YYYY`, e.g. `2026-07-10` → `July 10, 2026`) and copy the
   body **verbatim** — do not rephrase, re-capitalize, re-punctuate, or reorder
   any content. The PDF must match the blog word-for-word.

2. **Create/update the PDF source** `<slug>-pdf.md` in the repo root (this
   matches the existing convention: `the-fall-pdf.md`, `the-last-scarce-things-pdf.md`,
   `things-that-enrich-life-pdf.md`). Use the template below. Put the bold date
   line at the very top (top-left, like the blog), then the centered title, then
   the body copied verbatim.

3. **Generate** with the repo's local Chrome (puppeteer's bundled Chrome is
   usually missing on this machine):

   ```bash
   cd /Users/manish/Documents/trmanish.github.io
   export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   npx md-to-pdf <slug>-pdf.md --config-file /dev/null
   mv <slug>-pdf.pdf <Title_Case_With_Underscores>.pdf
   open <Title_Case_With_Underscores>.pdf
   ```

   The `--config-file /dev/null` makes md-to-pdf use the frontmatter in the file.

4. **Verify visually** — render page 1 to PNG and compare against the live blog:

   ```bash
   sips -s format png --resampleWidth 1000 <Title>.pdf --out /tmp/pdfcheck.png
   ```
   Read the PNG and confirm font, title size/weight, date placement, and bullet
   spacing match the blog. Fix and regenerate if anything is off.

## Frontmatter + template (copy exactly)

Take the CSS block verbatim from `things-that-enrich-life-pdf.md` in the repo
root — that file is the reference implementation and already mirrors the current
stylesheet. The body then follows:

```markdown
---
pdf_options:
  format: Letter
  margin: 14mm 16mm
  printBackground: true
css: |-
  ... (copy the whole css block from things-that-enrich-life-pdf.md) ...
---

<p class="article-date">Month DD, YYYY</p>

... post body copied VERBATIM from _posts/, with image src paths made relative,
    blank lines between bullets preserved ...
```

## Notes & gotchas

- **Do not** wrap the body in a `<div markdown="1">` — md-to-pdf uses `marked`,
  not Kramdown, so markdown inside HTML blocks won't render. Apply the container
  styling to `body` instead (as the template does).
- **Do not** add an `@page { margin: 0 }` rule — it cancels the `pdf_options`
  page margins and shoves content to the top edge. Let `pdf_options.margin`
  provide the breathing room.
- **Trailing empty page?** A long post can overflow the last page by a sliver,
  producing a blank final page. Fix by trimming OUTER whitespace only (never the
  inter-bullet spacing that matches the blog): reduce `pdf_options.margin` top/
  bottom (e.g. `20mm 20mm` → `12mm 20mm`) and set the body `margin` to
  `0 auto` instead of `40px auto`. Regenerate and confirm with
  `pdfinfo <file>.pdf | grep Pages` until the blank page is gone.
- Keep the Google Fonts `@import` covering Merriweather (300;400;700), Playfair
  Display (700) and Geist (300;400;700) — the body, the headings and the date
  line each need one of them.
- `printBackground: true` is what renders the paper colour and grain. Without it
  the PDF comes out plain white and the whole point is lost. Set the colour on
  `html` as well as `body` so it fills the full page, not just the content box.
- Generation takes a while (Chrome fetches the fonts); run it in the background
  rather than letting a two-minute foreground timeout kill it.
- If you edit the post content, update BOTH `_posts/<post>.md` and the
  `<slug>-pdf.md` so the blog and PDF stay in sync.
- Output PDF naming convention: Title in `Title_Case_With_Underscores.pdf`
  (e.g. `Things_That_Enrich_Life.pdf`, `The_Fall.pdf`).
