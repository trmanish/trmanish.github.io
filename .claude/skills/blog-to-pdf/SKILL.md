---
name: blog-to-pdf
description: >-
  Convert a post from THIS blog (trmanish.github.io / "Two Ticks") into a PDF
  that visually matches the live blog page exactly — same Geist font, colors,
  sizing, date placement, and loose-list spacing. Use ONLY for posts in this
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

## The source of truth (do not guess — mirror these)

From `assets/css/style.css`:
- Font: `Geist` (weights 300;400;700), loaded from Google Fonts. Body falls
  back to `sans-serif`.
- `body`: `color: #444`, `font-size: 15px`, `line-height: 1.7`, white background.
- `h1`: `font-size: 36px`, `font-weight: 600`, `margin-top: 40px`.

From `_layouts/post.html` the post is rendered inside:
- `<main style="max-width: 800px; margin: 40px auto; padding: 20px; text-align: left;">`
- with the date printed first as `<p><strong>{{ date | date: "%B %d, %Y" }}</strong></p>`

The post markdown body itself supplies the centered title
(`<div align="center"><h1><strong>Title</strong></h1></div>`) and the italic
byline line. Bullet lists in these posts use blank lines between items, which
renders as a **loose list** (each item wrapped in a `<p>`) — this is what gives
the generous vertical spacing between bullets. Preserve that; do NOT collapse
the blank lines and do NOT add custom `p`/`li` margin overrides.

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

```markdown
---
pdf_options:
  format: Letter
  margin: 20mm 20mm
  printBackground: true
css: |-
  /* Mirror the blog stylesheet (assets/css/style.css) exactly */
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;700&family=Merriweather:wght@300;400;700&family=Playfair+Display:wght@700&display=swap');

  body {
    font-family: 'Geist', sans-serif;
    background-color: white;
    color: #444;
    /* Mirror post.html <main style="max-width:800px;margin:40px auto;padding:20px"> */
    max-width: 800px;
    margin: 40px auto;
    padding: 20px;
    font-size: 15px;
    line-height: 1.7;
    text-align: left;
  }

  h1 {
    font-size: 36px;
    font-weight: 600;
    margin-top: 40px;
  }
---

**Month DD, YYYY**

<div align="center">
  <h1><strong>Post Title</strong></h1>
</div>

<br>

*Italic byline line, if the post has one*<br><br>


... post body copied VERBATIM from _posts/, blank lines between bullets preserved ...
```

## Notes & gotchas

- **Do not** wrap the body in a `<div markdown="1">` — md-to-pdf uses `marked`,
  not Kramdown, so markdown inside HTML blocks won't render. Apply the container
  styling to `body` instead (as the template does).
- **Do not** add an `@page { margin: 0 }` rule — it cancels the `pdf_options`
  page margins and shoves content to the top edge. Let `pdf_options.margin`
  (20mm) provide the breathing room.
- Keep the Google Fonts `@import` weights identical to the blog (`300;400;700`).
  The blog's `h1` requests weight 600, which with only 400/700 available renders
  at 700 — matching that fallback keeps the title weight identical. Don't add a
  `600` weight to the import.
- If you edit the post content, update BOTH `_posts/<post>.md` and the
  `<slug>-pdf.md` so the blog and PDF stay in sync.
- Output PDF naming convention: Title in `Title_Case_With_Underscores.pdf`
  (e.g. `Things_That_Enrich_Life.pdf`, `The_Fall.pdf`).
