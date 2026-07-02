#!/usr/bin/env node
// 音声整合性チェッカー — push前に必ず実行する
// Usage: node scripts/validate_audio.js
// 検証内容:
//   1. ROLEPLAY_SCENES: audio/keyAudio/hint キーの存在、keys と keyAudio の要素数一致
//   2. ROLEPLAY_SCENES: audio/keyAudio が指す mp3 が audio/ に実在すること
//   3. index.html 内の全 en: フィールド: textToAudioSrc() 変換後の mp3 が実在すること
//      （"(" で始まる非発話プレースホルダは対象外）
// 1件でも問題があれば exit 1

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const content = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = new Set(fs.readdirSync(path.join(ROOT, 'audio')));

// index.html の textToAudioSrc() / elevenlabs_generate.js の toFilename() と同一ルール
function toFilename(text) {
  return text.toLowerCase().replace(/[!?',.\/—–]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') + '.mp3';
}

const errors = [];

// --- 1&2. ROLEPLAY_SCENES ---
const start = content.indexOf('const ROLEPLAY_SCENES=[');
if (start === -1) { console.error('ROLEPLAY_SCENES not found'); process.exit(1); }
let depth = 0, end = -1;
for (let i = content.indexOf('[', start); i < content.length; i++) {
  if (content[i] === '[') depth++;
  else if (content[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const scenes = eval(content.slice(content.indexOf('[', start), end + 1));

scenes.forEach((s, i) => {
  const tag = `scene[${i}] ${s.cat}/${s.title}`;
  if (!s.audio) errors.push(`${tag}: audio キーがない`);
  else if (!files.has(s.audio + '.mp3')) errors.push(`${tag}: ${s.audio}.mp3 が存在しない`);
  if (!s.keyAudio) errors.push(`${tag}: keyAudio キーがない`);
  else {
    if (s.keys && s.keyAudio.length !== s.keys.length) errors.push(`${tag}: keys(${s.keys.length}) と keyAudio(${s.keyAudio.length}) の数が不一致`);
    s.keyAudio.forEach(k => { if (!files.has(k + '.mp3')) errors.push(`${tag}: ${k}.mp3 が存在しない`); });
  }
  if (!s.hint) errors.push(`${tag}: hint キーがない`);
});

// --- 3. 動的変換系（en: フィールド全走査）---
const enTexts = new Set();
for (const m of content.matchAll(/\ben:\s*"((?:[^"\\]|\\.)*)"/g)) enTexts.add(m[1].replace(/\\'/g, "'"));
for (const m of content.matchAll(/\ben:\s*'((?:[^'\\]|\\.)*)'/g)) enTexts.add(m[1].replace(/\\'/g, "'"));
let dynChecked = 0;
enTexts.forEach(t => {
  if (t.startsWith('(')) return; // 非発話プレースホルダ（例: "(無言でサインだけして去る)"）
  dynChecked++;
  const f = toFilename(t);
  if (!files.has(f)) errors.push(`en:"${t}" -> ${f} が存在しない`);
});

console.log(`ROLEPLAY scenes : ${scenes.length}`);
console.log(`en: fields      : ${dynChecked} checked (${enTexts.size - dynChecked} placeholders skipped)`);
console.log(`audio files     : ${files.size}`);

if (errors.length) {
  console.error(`\nNG: ${errors.length} 件の問題`);
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}
console.log('\nOK: 音声整合性に問題なし');
