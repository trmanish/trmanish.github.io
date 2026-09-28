import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import matter from 'gray-matter';
import { marked } from 'marked';
import { readFileSync, writeFileSync } from 'fs';

const siteUrl = process.env.SITE_URL || 'https://twoticks.blog';
const postFile = process.env.POST_FILE;

// Read and parse the post
const raw = readFileSync(postFile, 'utf-8');
const { data: frontmatter, content } = matter(raw);

const title = frontmatter.title;
const date = frontmatter.date;

// Build post URL from filename
const filename = postFile.split('/').pop().replace('.md', '');
const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
const postUrl = `${siteUrl}/${match[1]}/${match[2]}/${match[3]}/${match[4]}.html`;

// An email has no site to resolve /assets/... against, so every image and
// link is made absolute. The post's own title block is dropped, since the
// email prints the title itself, and images are kept to the column width.
const absolute = (url) => (url.startsWith('/') && !url.startsWith('//') ? `${siteUrl}${url}` : url);
const imageStyle = 'display:block;max-width:100%;height:auto;margin:24px auto;border-radius:4px;';
const postHtml = marked(content.replace(/<div align="center">\s*<h1>[\s\S]*?<\/h1>\s*<\/div>/i, ''))
  .replace(/(<(?:img|a|source)\b[^>]*?\b(?:src|href)=")([^"]+)"/gi, (_, head, url) => `${head}${absolute(url)}"`)
  .replace(/<img\b(?![^>]*\bstyle=)/gi, `<img style="${imageStyle}"`)
  .replace(/(<img\b[^>]*?\bstyle=")(?![^"]*max-width)/gi, `$1${imageStyle}`);

// The cover sits under the title. A post whose cover animates on the site
// (cover_video) shows its still here as a small round portrait instead.
const cover = frontmatter.image
  ? frontmatter.cover_video
    ? `<img src="${absolute(frontmatter.image)}" alt="" width="180" height="180" style="display:block;width:180px;height:180px;margin:24px auto 6px;border-radius:50%;object-fit:cover;">`
      + (frontmatter.image_credit ? `<p style="margin:0 0 20px;text-align:center;font-size:12px;font-style:italic;color:#999;">${frontmatter.image_credit}</p>` : '')
    : `<img src="${absolute(frontmatter.image)}" alt="" style="${imageStyle}">`
  : '';

// Build email HTML
const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif; color: #444; line-height: 1.7; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 24px; font-weight: 600; }
    .post-content { font-size: 15px; }
    .read-online { display: inline-block; margin-top: 20px; padding: 10px 24px; background: #1F2937; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${cover}
  <div class="post-content">
    ${postHtml}
  </div>
  <a href="${postUrl}" class="read-online">Read on Two Ticks</a>
  <div class="footer">
    <p>You received this because you subscribed to Two Ticks.</p>
  </div>
</body>
</html>
`;

// DRY_RUN=1 writes the email to newsletter-preview.html and sends nothing.
if (process.env.DRY_RUN) {
  writeFileSync('newsletter-preview.html', emailHtml);
  console.log(`Preview written for "${title}" (${postUrl}).`);
  process.exit(0);
}

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

// Fetch all subscribers
const subscribers = await sql`SELECT email FROM subscribers WHERE confirmed = true`;

if (subscribers.length === 0) {
  console.log('No subscribers found. Skipping.');
  process.exit(0);
}

console.log(`Sending "${title}" to ${subscribers.length} subscriber(s)...`);

// One message per subscriber, so nobody can see anyone else's address and
// each copy is a genuine one-to-one email. Resend's batch endpoint takes up
// to 100 messages per call.
const batchSize = 100;
let sent = 0;
let failed = 0;

for (let i = 0; i < subscribers.length; i += batchSize) {
  const batch = subscribers.slice(i, i + batchSize);
  const batchNumber = Math.floor(i / batchSize) + 1;

  const messages = batch.map((s) => ({
    from: 'Two Ticks <newsletter@twoticks.blog>',
    to: s.email,
    subject: `New Tick: ${title}`,
    html: emailHtml,
  }));

  try {
    // The SDK reports API failures in `error` rather than throwing, so a
    // failed batch would otherwise look like a success.
    const { error } = await resend.batch.send(messages);
    if (error) throw error;

    sent += messages.length;
    console.log(`Sent batch ${batchNumber} (${messages.length} emails)`);
  } catch (error) {
    failed += messages.length;
    console.error(`Failed batch ${batchNumber}:`, error);
  }
}

console.log(`Newsletter sent to ${sent} subscriber(s)${failed ? `, ${failed} failed` : ''}.`);

if (sent === 0) {
  console.error('No newsletter emails were delivered.');
  process.exit(1);
}
