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

console.log('\n=== 音声整合性チェック ===');
try {
  execFileSync('node', [path.join(ROOT, 'scripts', 'validate_audio.js')], { stdio: 'inherit' });
} catch (e) {
  hasError = true;
}

console.log('\n' + (hasError ? 'NG: 上記のエラーを修正してから commit/push すること' : 'OK: push前チェックすべて合格'));
process.exit(hasError ? 1 : 0);
