#!/usr/bin/env node
// Turns posts marked `narration: true` into a small listen-along audio file.
//
// Each post's prose is read by an ElevenLabs voice, one paragraph-sized chunk
// at a time, the chunks are joined, and for posts marked `narration_music: true`
// the music bed loops quietly underneath for as long as the voice speaks.
//
// The result lands in assets/audio/<post>-<hash>.m4a, and _data/narration.json
// records it for the post layout. The hash covers the text, the voice and the
// music, so an unchanged post is never sent to ElevenLabs twice and a changed
// one gets a new file name that no browser has cached.
//
//   node _narration/narrate.mjs            generate what is missing or stale
//   node _narration/narrate.mjs --dry-run  print what would be read, spend nothing
//   node _narration/narrate.mjs --say      use macOS `say` instead of ElevenLabs
//   node _narration/narrate.mjs --only silence-is-also-a-language
//
// Needs ffmpeg, and ELEVENLABS_API_KEY in the environment unless --dry-run/--say.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const POSTS = path.join(ROOT, '_posts');
const AUDIO_DIR = path.join(ROOT, 'assets/audio');
const MANIFEST = path.join(ROOT, '_data/narration.json');
const MUSIC = path.join(ROOT, '_narration/music/now-we-are-free.m4a');

// The blog's narrator voice. Override with NARRATION_VOICE_ID.
const VOICE_ID = process.env.NARRATION_VOICE_ID || 'XFQFwy8OEb9lvFQIMZ5a';
const MODEL_ID = process.env.NARRATION_MODEL_ID || 'eleven_multilingual_v2';
const VOICE_SETTINGS = { stability: 0.6, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, speed: 0.92 };

const MUSIC_VOLUME = 0.11;   // how loud the bed sits under the voice
const MUSIC_LEAD_IN = 3;     // seconds of music before the voice starts
const MUSIC_TAIL = 5;        // seconds of music after the voice ends
const CHUNK_CHARS = 2200;    // ElevenLabs reads best in paragraph-sized pieces
const BITRATE = '48k';       // AAC mono: ~0.36 MB a minute

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useSay = args.includes('--say');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function frontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  const fields = {};
  if (!match) return { fields, body: source };
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (pair) fields[pair[1]] = pair[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fields, body: source.slice(match[0].length) };
}

const decode = (text) => text
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, ', ').replace(/&hellip;/g, '...').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const squash = (text) => text.replace(/\s+/g, ' ').trim();

// Markdown and inline HTML become the paragraphs a narrator would read aloud.
export function narrationText(title, body) {
  let text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div align="center">\s*<h1>[\s\S]*?<\/h1>\s*<\/div>/i, '')
    // "First published on LI" credit lines are for the page, not the ear.
    .replace(/<span style="font-size:\s*12px;?">[\s\S]*?<\/span>/gi, '')
    .replace(/^\*First Published[^\n]*$/gim, '');

  // Boxed quotes are kept only when they say something the prose does not.
  const quotes = [];
  text = text.replace(/<div style="[^"]*#fcfcfc[^"]*">([\s\S]*?)<\/div>/gi, (_, inner) => {
    quotes.push(squash(decode(inner.replace(/<[^>]+>/g, ' '))));
    return `\n\n@@QUOTE${quotes.length - 1}@@\n\n`;
  });

  text = text
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*(.+)$/gm, '\n$1.\n')
    .replace(/^\s*>\s?/gm, '')
    // Each list item is read as its own sentence, with a pause after it.
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '\n\n')
    .replace(/\*\*|__|\*|_(?=\S)|(?<=\S)_|`/g, '');
  text = decode(text);

  const paragraphs = text.split(/\n\s*\n/).map((p) => squash(p)).filter(Boolean);
  const prose = paragraphs.filter((p) => !p.startsWith('@@QUOTE')).join(' ').toLowerCase();
  const read = paragraphs.flatMap((p) => {
    const quote = p.match(/^@@QUOTE(\d+)@@$/);
    if (!quote) return [p.replace(/\.\.\.+$/, '.').replace(/([^.!?:;"')])$/, '$1.')];
    const said = quotes[Number(quote[1])];
    return said && !prose.includes(said.toLowerCase().replace(/[.!?]+$/, '')) ? [said] : [];
  });
  return [`${title}.`, ...read];
}

function chunks(paragraphs) {
  const out = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > CHUNK_CHARS) {
      out.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) out.push(current);
  return out;
}

async function speak(text, previous, next, file) {
  if (useSay) {
    execFileSync('say', ['-v', 'Daniel', '-r', '165', '-o', `${file}.aiff`, text]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${file}.aiff`, '-ar', '44100', '-ac', '1', file]);
    return;
  }
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS, previous_text: previous, next_text: next }),
    });
    if (response.ok) {
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return;
    }
    const detail = await response.text();
    if (attempt >= 4 || ![429, 500, 502, 503].includes(response.status)) {
      throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
}

const ffmpeg = (...argv) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...argv]);
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

async function render(post, paragraphs, outFile) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'narrate-'));
  const pieces = chunks(paragraphs);
  const list = [];
  ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.7', path.join(work, 'gap.wav'));
  for (let i = 0; i < pieces.length; i++) {
    const file = path.join(work, `part${i}.${useSay ? 'wav' : 'mp3'}`);
    console.log(`  chunk ${i + 1}/${pieces.length} (${pieces[i].length} chars)`);
    await speak(pieces[i], pieces[i - 1]?.slice(-500) || undefined, pieces[i + 1]?.slice(0, 500) || undefined, file);
    const wav = path.join(work, `part${i}.wav`);
    if (!useSay) ffmpeg('-i', file, '-ar', '44100', '-ac', '1', wav);
    list.push(`file '${wav}'`, `file '${path.join(work, 'gap.wav')}'`);
  }
  fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n'));
  const voice = path.join(work, 'voice.wav');
  ffmpeg('-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', voice);

  const encode = ['-c:a', 'aac', '-b:a', BITRATE, '-ac', '1', '-movflags', '+faststart', outFile];
  if (post.music) {
    const total = duration(voice) + MUSIC_LEAD_IN + MUSIC_TAIL;
    // The bed loops under the whole reading, fades in, and fades out after it.
    ffmpeg(
      '-stream_loop', '-1', '-i', MUSIC, '-i', voice,
      '-filter_complex',
      `[0:a]aformat=channel_layouts=mono,volume=${MUSIC_VOLUME},atrim=0:${total.toFixed(2)},afade=t=in:d=2,afade=t=out:st=${(total - MUSIC_TAIL).toFixed(2)}:d=${MUSIC_TAIL}[bed];` +
      `[1:a]adelay=${MUSIC_LEAD_IN * 1000},apad[voice];` +
      `[bed][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`,
      '-map', '[out]', ...encode,
    );
  } else {
    ffmpeg('-i', voice, ...encode);
  }
  fs.rmSync(work, { recursive: true, force: true });
}

async function main() {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const musicHash = fs.existsSync(MUSIC) ? createHash('sha256').update(fs.readFileSync(MUSIC)).digest('hex') : '';
  const posts = fs.readdirSync(POSTS).filter((name) => name.endsWith('.md')).map((name) => {
    const { fields, body } = frontMatter(fs.readFileSync(path.join(POSTS, name), 'utf8'));
    return { key: name.replace(/\.md$/, ''), fields, body };
  }).filter((post) => post.fields.narration === 'true' && post.fields.published !== 'false');

  let changed = false;
  for (const post of posts) {
    if (only && !post.key.includes(only)) continue;
    post.music = post.fields.narration_music === 'true';
    const paragraphs = narrationText(post.fields.title, post.body);
    const characters = paragraphs.join('\n\n').length;
    const hash = createHash('sha256').update(JSON.stringify({
      paragraphs, VOICE_ID, MODEL_ID, VOICE_SETTINGS, BITRATE,
      music: post.music ? { musicHash, MUSIC_VOLUME, MUSIC_LEAD_IN, MUSIC_TAIL } : null,
      say: useSay,
    })).digest('hex').slice(0, 10);

    if (dryRun) {
      console.log(`\n=== ${post.key}  (${characters} chars, music: ${post.music})\n`);
      console.log(paragraphs.join('\n\n'));
      continue;
    }
    if (manifest[post.key]?.hash === hash && fs.existsSync(path.join(ROOT, manifest[post.key].src))) {
      console.log(`= ${post.key} is up to date`);
      continue;
    }
    if (!useSay && !process.env.ELEVENLABS_API_KEY) {
      console.log(`! ${post.key} needs audio, but ELEVENLABS_API_KEY is not set; skipping`);
      continue;
    }

    console.log(`> ${post.key} (${characters} chars${post.music ? ', with music' : ''})`);
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const src = `assets/audio/${post.key.replace(/^\d{4}-\d{2}-\d{2}-/, '')}-${hash}.m4a`;
    await render(post, paragraphs, path.join(ROOT, src));
    const old = manifest[post.key]?.src;
    if (old && old !== src) fs.rmSync(path.join(ROOT, old), { force: true });
    manifest[post.key] = {
      src,
      hash,
      seconds: Math.round(duration(path.join(ROOT, src))),
      bytes: fs.statSync(path.join(ROOT, src)).size,
    };
    changed = true;
    console.log(`  wrote ${src} (${(manifest[post.key].bytes / 1e6).toFixed(1)} MB, ${Math.round(manifest[post.key].seconds / 60)} min)`);
  }

  if (changed) {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
