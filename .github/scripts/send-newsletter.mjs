import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import matter from 'gray-matter';
import { marked } from 'marked';
import { readFileSync } from 'fs';

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);
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

// Convert markdown to HTML
const postHtml = marked(content);

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

// Fetch all subscribers
const subscribers = await sql`SELECT email FROM subscribers WHERE confirmed = true`;

if (subscribers.length === 0) {
  console.log('No subscribers found. Skipping.');
  process.exit(0);
}

console.log(`Sending "${title}" to ${subscribers.length} subscriber(s)...`);

// Send in batches of 50
const batchSize = 50;
for (let i = 0; i < subscribers.length; i += batchSize) {
  const batch = subscribers.slice(i, i + batchSize);
  const emails = batch.map(s => s.email);

  try {
    await resend.emails.send({
      from: 'Two Ticks <newsletter@twoticks.blog>',
      to: emails,
      subject: `New Tick: ${title}`,
      html: emailHtml,
    });
    console.log(`Sent batch ${Math.floor(i / batchSize) + 1} (${emails.length} emails)`);
  } catch (error) {
    console.error(`Failed batch ${Math.floor(i / batchSize) + 1}:`, error);
  }
}

console.log('Newsletter sent.');
