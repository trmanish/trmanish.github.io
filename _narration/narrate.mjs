#!/usr/bin/env node
// Turns posts marked `narration: true` into a small listen-along audio file.
//
// Each post's prose is read by an ElevenLabs voice, one paragraph-sized chunk
// at a time, the chunks are joined, and for posts marked `narration_music: true`
// the music bed loops quietly underneath for as long as the voice speaks.
// `narration_music: interstellar-stay` picks _narration/music/interstellar-stay.m4a
// instead of the default bed. Beds are pre-trimmed, loop-ready and matched to
// about -19 LUFS, so one volume setting suits them all.
//
// Every clip ElevenLabs makes stays in the account's history, and a clip whose
// text was read before is downloaded from there for free rather than generated
// and billed again. So changing the music, or the mix, costs nothing.
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
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const POSTS = path.join(ROOT, '_posts');
const AUDIO_DIR = path.join(ROOT, 'assets/audio');
const MANIFEST = path.join(ROOT, '_data/narration.json');
const MUSIC_DIR = path.join(ROOT, '_narration/music');
const DEFAULT_MUSIC = 'now-we-are-free';

// The blog's narrator voice. Override with NARRATION_VOICE_ID.
const VOICE_ID = process.env.NARRATION_VOICE_ID || 'XFQFwy8OEb9lvFQIMZ5a';
const MODEL_ID = process.env.NARRATION_MODEL_ID || 'eleven_multilingual_v2';
// ElevenLabs' guidance for narration: style at 0 (anything more makes the pace
// uneven), stability near 0.5 (higher turns flat), a slightly slow speed.
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.88 };
// Only history clips made on or after this moment are reused. Move it forward
// whenever VOICE_SETTINGS or the chunking changes, so a clip read the old way
// is never mistaken for one read the new way.
const SETTINGS_SINCE = Date.parse('2026-09-28T00:22:02Z') / 1000;

const MUSIC_VOLUME = 0.22;   // a steady bed about 16 dB under the voice
const VOICE_LOUDNESS = -16;  // LUFS; the usual level for spoken audio
const MUSIC_LEAD_IN = 3;     // seconds of music before the voice starts
const MUSIC_TAIL = 5;        // seconds of music after the voice ends
const CHUNK_CHARS = 800;     // ElevenLabs advises under 800-900 characters a request
const PARAGRAPH_BREAK = '<break time="1.0s" />';  // said between paragraphs in a chunk
const GAP_PARAGRAPH = 1.0;   // silence between chunks that end a paragraph
const GAP_SENTENCE = 0.3;    // silence between chunks that split a long paragraph
const BITRATE = '48k';       // AAC mono: ~0.36 MB a minute

// ElevenLabs reads briskly and barely rests between sentences. These give the
// reading room to breathe without paying to voice it again: the natural gaps
// in the voice are found and lengthened, and the whole reading is eased down.
const PACING = {
  tempo: 1,             // the voice's own speed setting now sets the pace
  gapThreshold: -38,    // dB below which the voice counts as silent
  sentencePause: 0.25,  // extra seconds added at each sentence break
  paragraphPause: 0.3,  // extra seconds added at each paragraph break
};

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

// Pieces of at most CHUNK_CHARS: whole paragraphs where they fit, a long
// paragraph split at its sentences. Paragraphs inside one piece are joined by
// a break tag; each piece notes whether it ends a paragraph, which sets the
// silence laid after it.
function chunks(paragraphs) {
  const units = paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= CHUNK_CHARS) return [{ text: paragraph, endsParagraph: true }];
    const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]?|$)\s*/g) || [paragraph];
    const parts = [];
    let part = '';
    for (const sentence of sentences) {
      if (part && part.length + sentence.length > CHUNK_CHARS) {
        parts.push(part.trim());
        part = '';
      }
      part += sentence;
    }
    if (part.trim()) parts.push(part.trim());
    return parts.map((text, i) => ({ text, endsParagraph: i === parts.length - 1 }));
  });
  const out = [];
  let current = null;
  for (const unit of units) {
    if (current && (!current.endsParagraph || current.text.length + unit.text.length > CHUNK_CHARS)) {
      out.push(current);
      current = null;
    }
    current = current
      ? { text: `${current.text} ${PARAGRAPH_BREAK}\n\n${unit.text}`, endsParagraph: unit.endsParagraph }
      : { ...unit };
  }
  if (current) out.push(current);
  return out;
}

const API = 'https://api.elevenlabs.io/v1';
const headers = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY });

// Text already read in this voice, mapped to its history clip.
let spoken = null;
async function history() {
  if (spoken) return spoken;
  spoken = new Map();
  let after = null;
  try {
    for (let page = 0; page < 50; page++) {
      const query = new URLSearchParams({ page_size: '1000', voice_id: VOICE_ID });
      if (after) query.set('start_after_history_item_id', after);
      const response = await fetch(`${API}/history?${query}`, { headers: headers() });
      if (!response.ok) throw new Error(`history ${response.status}`);
      const data = await response.json();
      for (const item of data.history || []) {
        if (item.date_unix < SETTINGS_SINCE) continue;
        const key = `${item.model_id}\n${item.text}`;
        if (!spoken.has(key)) spoken.set(key, item.history_item_id);
      }
      if (!data.has_more) break;
      after = data.last_history_item_id;
    }
  } catch (error) {
    console.log(`  (could not read ElevenLabs history, generating fresh: ${error.message})`);
  }
  return spoken;
}

async function speak(text, previous, next, file, stitch = []) {
  if (!useSay) {
    const reuse = (await history()).get(`${MODEL_ID}\n${text}`);
    if (reuse) {
      const response = await fetch(`${API}/history/${reuse}/audio`, { headers: headers() });
      if (response.ok) {
        fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
        console.log('    reused from history, not billed');
        return null;
      }
    }
  }
  if (useSay) {
    execFileSync('say', ['-v', 'Daniel', '-r', '165', '-o', `${file}.aiff`, text.replace(/<break[^>]*>/g, '[[slnc 1000]]')]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${file}.aiff`, '-ar', '44100', '-ac', '1', file]);
    return null;
  }
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${API}/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS, previous_text: previous, next_text: next,
        // Request stitching: the voice carries on from the audio just made.
        ...(stitch.length ? { previous_request_ids: stitch.slice(-3) } : {}),
      }),
    });
    if (response.ok) {
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return response.headers.get('request-id');
    }
    const detail = await response.text();
    if (response.status === 400 && stitch.length) {
      console.log('    stitching refused, retrying without it');
      stitch = [];
      continue;
    }
    if (attempt >= 4 || ![429, 500, 502, 503].includes(response.status)) {
      throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
}

const ffmpeg = (...argv) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...argv], { maxBuffer: 1 << 26 });

// Lengthens the pauses between sentences. The text says how many sentence and
// paragraph breaks there are, so exactly that many of the longest natural gaps
// in the voice are widened, the very longest (paragraphs) the most, while the
// short breaths at commas are left alone. Then the reading is eased down.
function pace(input, output, work, sentenceCount, paragraphCount) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', input, '-af',
    `silencedetect=noise=${PACING.gapThreshold}dB:d=0.08`, '-f', 'null', '-'],
  { maxBuffer: 1 << 26 }).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const make = (seconds, name) => {
    const file = path.join(work, name);
    ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(seconds), file);
    return file;
  };
  const shortPause = make(PACING.sentencePause, 'pause-s.wav');
  const longPause = make(PACING.paragraphPause, 'pause-p.wav');
  const gaps = starts.map((start, i) => ({ start, end: ends[i] }))
    .filter((gap) => gap.end !== undefined && gap.start > 0.05)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const chosen = gaps.slice(0, sentenceCount)
    .map((gap, rank) => ({ ...gap, pause: rank < paragraphCount ? longPause : shortPause }))
    .sort((a, b) => a.start - b.start);
  console.log(`  widened ${chosen.length} of ${gaps.length} pauses (${sentenceCount} sentences, ${paragraphCount} paragraphs)`);
  const list = [];
  let from = 0;
  for (const gap of chosen) {
    const cut = (gap.start + gap.end) / 2;
    list.push(`file '${input}'`, `inpoint ${from.toFixed(4)}`, `outpoint ${cut.toFixed(4)}`, `file '${gap.pause}'`);
    from = cut;
  }
  list.push(`file '${input}'`, `inpoint ${from.toFixed(4)}`);
  fs.writeFileSync(path.join(work, 'paced.txt'), list.join('\n'));
  const spaced = path.join(work, 'spaced.wav');
  ffmpeg('-f', 'concat', '-safe', '0', '-i', path.join(work, 'paced.txt'), spaced);
  ffmpeg('-i', spaced, '-af', `atempo=${PACING.tempo}`, '-ar', '44100', '-ac', '1', output);
}
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

async function render(post, paragraphs, outFile) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'narrate-'));
  const pieces = chunks(paragraphs);
  const list = [];
  const gapParagraph = path.join(work, 'gap-p.wav');
  const gapSentence = path.join(work, 'gap-s.wav');
  ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(GAP_PARAGRAPH), gapParagraph);
  ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(GAP_SENTENCE), gapSentence);
  const plain = (text) => text?.replace(/<break[^>]*>/g, '');
  const stitch = [];
  for (let i = 0; i < pieces.length; i++) {
    const file = path.join(work, `part${i}.${useSay ? 'wav' : 'mp3'}`);
    console.log(`  chunk ${i + 1}/${pieces.length} (${pieces[i].text.length} chars)`);
    const id = await speak(pieces[i].text, plain(pieces[i - 1]?.text)?.slice(-500) || undefined,
      plain(pieces[i + 1]?.text)?.slice(0, 500) || undefined, file, stitch);
    if (id) stitch.push(id);
    const wav = path.join(work, `part${i}.wav`);
    if (!useSay) ffmpeg('-i', file, '-ar', '44100', '-ac', '1', wav);
    list.push(`file '${wav}'`, `file '${pieces[i].endsParagraph ? gapParagraph : gapSentence}'`);
  }
  fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n'));
  const raw = path.join(work, 'raw.wav');
  ffmpeg('-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', raw);
  const voice = path.join(work, 'voice.wav');
  const spoken = paragraphs.join('\n\n');
  const sentences = (spoken.match(/[.!?]+["')\]]?(?=\s|$)/g) || []).length;
  pace(raw, voice, work, sentences, paragraphs.length);

  const encode = ['-c:a', 'aac', '-b:a', BITRATE, '-ac', '1', '-movflags', '+faststart', outFile];
  if (post.music) {
    const total = duration(voice) + MUSIC_LEAD_IN + MUSIC_TAIL;
    // The bed loops under the whole reading, fades in, and fades out after it.
    ffmpeg(
      '-stream_loop', '-1', '-i', post.music, '-i', voice,
      '-filter_complex',
      `[0:a]aformat=channel_layouts=mono,volume=${MUSIC_VOLUME},atrim=0:${total.toFixed(2)},afade=t=in:d=2,afade=t=out:st=${(total - MUSIC_TAIL).toFixed(2)}:d=${MUSIC_TAIL}[bed];` +
      `[1:a]loudnorm=I=${VOICE_LOUDNESS}:TP=-1.5:LRA=11,aresample=44100,adelay=${MUSIC_LEAD_IN * 1000},apad[voice];` +
      `[bed][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]`,
      '-map', '[out]', ...encode,
    );
  } else {
    ffmpeg('-i', voice, '-af', `loudnorm=I=${VOICE_LOUDNESS}:TP=-1.5:LRA=11,aresample=44100`, ...encode);
  }
  fs.rmSync(work, { recursive: true, force: true });
}

async function main() {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const musicHash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const posts = fs.readdirSync(POSTS).filter((name) => name.endsWith('.md')).map((name) => {
    const { fields, body } = frontMatter(fs.readFileSync(path.join(POSTS, name), 'utf8'));
    return { key: name.replace(/\.md$/, ''), fields, body };
  }).filter((post) => post.fields.narration === 'true' && post.fields.published !== 'false');

  let changed = false;
  for (const post of posts) {
    if (only && !post.key.includes(only)) continue;
    const bed = post.fields.narration_music;
    post.music = bed && bed !== 'false' ? path.join(MUSIC_DIR, `${bed === 'true' ? DEFAULT_MUSIC : bed}.m4a`) : null;
    if (post.music && !fs.existsSync(post.music)) throw new Error(`${post.key}: no music file ${post.music}`);
    const paragraphs = narrationText(post.fields.title, post.body);
    const characters = paragraphs.join('\n\n').length;
    const hash = createHash('sha256').update(JSON.stringify({
      paragraphs, VOICE_ID, MODEL_ID, VOICE_SETTINGS, BITRATE, PACING, CHUNK_CHARS, PARAGRAPH_BREAK,
      music: post.music ? { musicHash: musicHash(post.music), MUSIC_VOLUME, MUSIC_LEAD_IN, MUSIC_TAIL } : null,
      VOICE_LOUDNESS,
      say: useSay,
    })).digest('hex').slice(0, 10);

    if (dryRun) {
      console.log(`\n=== ${post.key}  (${characters} chars, music: ${post.music ? path.basename(post.music) : 'none'})\n`);
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
