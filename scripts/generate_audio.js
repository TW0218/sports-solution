#!/usr/bin/env node
// Generates MP3 files for all phrases in index.html that don't already have audio.
// Uses: say -v Daniel (macOS) + ffmpeg for AIFF→MP3 conversion.
// Run: node scripts/generate_audio.js
// Options: --dry-run (list missing only), --force (regenerate all)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
const HTML_PATH = path.join(ROOT, 'index.html');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function toFilename(text) {
  return text.replace(/[!?',.\/]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_');
}

function extractPhrases(html) {
  const seen = new Set();
  const result = [];
  for (const m of html.matchAll(/\{c:"[^"]*",en:"([^"]*)"/g)) {
    const en = m[1];
    if (!seen.has(en)) { seen.add(en); result.push(en); }
  }
  return result;
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const phrases = extractPhrases(html);

const missing = phrases.filter(p => {
  const mp3 = path.join(AUDIO_DIR, toFilename(p) + '.mp3');
  return FORCE || !fs.existsSync(mp3);
});

console.log(`Total phrases: ${phrases.length}`);
console.log(`Need audio:   ${missing.length}`);

if (DRY_RUN) {
  missing.forEach(p => console.log(' -', p));
  process.exit(0);
}

if (missing.length === 0) {
  console.log('All phrases already have MP3 files.');
  process.exit(0);
}

let ok = 0, fail = 0;
const tmp = '/tmp/ssg_audio.aiff';

for (let i = 0; i < missing.length; i++) {
  const phrase = missing[i];
  const name = toFilename(phrase);
  const mp3 = path.join(AUDIO_DIR, name + '.mp3');

  process.stdout.write(`[${i + 1}/${missing.length}] ${phrase} ... `);
  try {
    execSync(`say -v Daniel ${JSON.stringify(phrase)} -o ${JSON.stringify(tmp)}`, { stdio: 'pipe' });
    execSync(`ffmpeg -y -i ${JSON.stringify(tmp)} -codec:a libmp3lame -qscale:a 4 ${JSON.stringify(mp3)} 2>/dev/null`, { stdio: 'pipe' });
    fs.unlinkSync(tmp);
    console.log('OK');
    ok++;
  } catch (e) {
    console.log('FAILED:', e.message.split('\n')[0]);
    fail++;
  }
}

console.log(`\nDone. OK: ${ok}, Failed: ${fail}`);
