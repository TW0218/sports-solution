#!/usr/bin/env node
// push前の統合チェック — 構文チェック + 音声整合性チェックをまとめて実行
// Usage: node scripts/verify.js  (または npm run verify)
// モデルの記憶力に依存させないための1コマンド化。手順の詳細はCLAUDE.mdを参照。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let hasError = false;

console.log('=== 構文チェック（index.html内のscriptブロック） ===');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let syntaxOk = true;
scripts.forEach((s, i) => {
  try {
    new Function(s);
  } catch (e) {
    console.error(`  NG: block ${i}: ${e.message}`);
    syntaxOk = false;
  }
});
if (syntaxOk) {
  console.log(`  OK (${scripts.length} script blocks)`);
} else {
  hasError = true;
}

console.log('\n=== 絵文字チェック ===');
// 「絵文字は一切使わない、アイコンは必ずSVG」ルールの機械的強制。
// 過去にレビュー時点でも9箇所しか見つけられず、実際には18箇所あった実績があり、
// 目視レビューだけでは見逃しをゼロにできないための対策。
// 許可リストは「機能するボタン/状態アイコンとして使われている単色記号」のみ。
// 新規コードでこれらの文字を装飾目的で使うのは禁止（あくまで既存箇所の例外）。
const EMOJI_ALLOWLIST = new Set(['✓', '✕', '☆', '★', '⭐']);
const EMOJI_RANGES = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
let emojiOk = true;
html.split('\n').forEach((line, i) => {
  const matches = line.match(EMOJI_RANGES) || [];
  const banned = [...new Set(matches.filter(c => !EMOJI_ALLOWLIST.has(c)))];
  if (banned.length) {
    console.error(`  NG: line ${i + 1}: ${banned.join(' ')} - ${line.trim().slice(0, 80)}`);
    emojiOk = false;
  }
});
if (emojiOk) {
  console.log(`  OK (許可リスト外の絵文字なし。許可リスト: ${[...EMOJI_ALLOWLIST].join(' ')})`);
} else {
  hasError = true;
}

console.log('\n=== 音声整合性チェック ===');
try {
  execFileSync('node', [path.join(ROOT, 'scripts', 'validate_audio.js')], { stdio: 'inherit' });
} catch (e) {
  hasError = true;
}

console.log('\n' + (hasError ? 'NG: 上記のエラーを修正してから commit/push すること' : 'OK: push前チェックすべて合格'));
process.exit(hasError ? 1 : 0);
