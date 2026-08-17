import puppeteer from 'puppeteer';

// Usage: node render-live.mjs <live-post-url> <output.pdf>
const URL = process.argv[2];
const OUT = process.argv[3];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--font-render-hinting=none', '--force-color-profile=srgb'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: 2 });

// Light the lantern the way the site itself does: lamp.js reads this key on
// load and adds .is-night before first paint.
await page.goto('https://twoticks.blog/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('twoticks-lamp', 'night'));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });

// Belt and braces in case the script did not run.
await page.evaluate(() => document.body.classList.add('is-night'));
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 3000));

const state = await page.evaluate(() => ({
  night: document.body.classList.contains('is-night'),
  lantern: !!document.querySelector('[data-lamp]'),
  bg: getComputedStyle(document.body).backgroundColor,
  height: document.body.scrollHeight,
}));
console.log('page state:', JSON.stringify(state));

// screen media keeps the dark room; print media would revert it to white.
await page.emulateMediaType('screen');

await page.pdf({
  path: OUT,
  printBackground: true,
  format: 'Letter',
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  scale: 0.72,
});

await browser.close();
console.log('written:', OUT);
