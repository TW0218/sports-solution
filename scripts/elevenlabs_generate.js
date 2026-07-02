#!/usr/bin/env node
// Generates MP3 files via ElevenLabs TTS for all phrases in phrases_to_record.txt
// Usage: ELEVEN_API_KEY=xxx node scripts/elevenlabs_generate.js
// Options: --dry-run (list targets only), --force (regenerate existing files)

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = process.env.ELEVEN_API_KEY;
if (!API_KEY) { console.error('Set ELEVEN_API_KEY env var'); process.exit(1); }

const VOICE_ID   = '1TE7ou3jyxHsyRehUuMB'; // Eastend Steve
const MODEL_ID   = 'eleven_multilingual_v2';
const AUDIO_DIR  = path.join(__dirname, '..', 'audio');
const TXT_PATH   = path.join(__dirname, 'phrases_to_record.txt');
const DRY_RUN    = process.argv.includes('--dry-run');
const FORCE      = process.argv.includes('--force');

function toFilename(text) {
  // Same rule as textToAudioSrc() in index.html — always lowercase
  return text.toLowerCase().replace(/[!?',.\/—–]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '.mp3';
}

function fetchMp3(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 1.0, similarity_boost: 1.0, style: 0.0, use_speaker_boost: true },
      output_format: 'mp3_44100_128',
      speed: 1.0,
    });
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', c => err += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const lines = fs.readFileSync(TXT_PATH, 'utf8').split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== 'ここから');

  const targets = lines.filter(phrase => {
    const filename = toFilename(phrase);
    return FORCE || !fs.existsSync(path.join(AUDIO_DIR, filename));
  });

  console.log(`Phrases in file : ${lines.length}`);
  console.log(`Need generation : ${targets.length}`);

  if (DRY_RUN) {
    targets.forEach(p => console.log(' -', p, '->', toFilename(p)));
    return;
  }

  if (targets.length === 0) { console.log('Nothing to do.'); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const phrase = targets[i];
    const filename = toFilename(phrase);
    const outPath = path.join(AUDIO_DIR, filename);
    process.stdout.write(`[${i + 1}/${targets.length}] ${phrase} -> ${filename} ... `);
    try {
      const buf = await fetchMp3(phrase);
      fs.writeFileSync(outPath, buf);
      console.log(`OK (${(buf.length/1024).toFixed(1)}KB)`);
      ok++;
    } catch (e) {
      console.log(`FAILED: ${e.message.slice(0, 80)}`);
      fail++;
    }
    // Rate limit: ~3 req/sec on free tier
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(`\nDone. OK: ${ok}, Failed: ${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
