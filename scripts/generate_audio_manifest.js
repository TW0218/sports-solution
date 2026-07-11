#!/usr/bin/env node
// audio/ ディレクトリの実ファイル一覧から audio-manifest.json を生成する。
// 「音声一括DL」機能（index.htmlのbulkDownloadAudio()）が参照する唯一の音声ファイルリスト。
// テキスト→ファイル名変換ロジック（textToAudioSrc()等）をここに複製しない設計にすることで、
// 変換ルールの同期ズレ事故を構造的に起こさない（実ファイルからの機械生成のみ）。
// npm run verify のたびに再生成されるため、常に audio/ の実態と一致する。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(ROOT, 'audio')).filter(f => f.endsWith('.mp3')).sort();
fs.writeFileSync(path.join(ROOT, 'audio-manifest.json'), JSON.stringify(files));
console.log(`audio-manifest.json: ${files.length} files`);
