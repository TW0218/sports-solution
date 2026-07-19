#!/usr/bin/env node
// ROLEPLAY_SCENES 汎用マージテンプレート
//
// 使い方: このファイルをscratchpadへコピーし、下の TRANSFORM 関数だけを書き換えて実行する。
// 抽出・1:1照合・フィールド順序・書き戻し・検証はテンプレート側が保証する。
// （過去にマージスクリプトを毎回ゼロから書き直して事故りかけたための共通化。
//   merge_hintword.js / merge_lineja.js / merge_keysja.js が実質同一だった）
//
// 実行: node merge_template.js
// 何も変更しないdry-runをしたい場合: DRY_RUN=1 node merge_template.js

const fs = require('fs');

const INDEX_PATH = '/Users/takuwatanabe/Desktop/MMS/アプリ開発/sports-solution/index.html';

// ============================================================
// フィールドの並び順（シーンをファイルへ書き戻す時の順序）。
// index.htmlに新フィールドを足す時はここにも追加すること。
// 現在の実物の順序と一致しているかは実行時に自動検証される。
// ============================================================
const FIELD_ORDER = ['cat','title','situation','npc','lineJa','line','audio','keys','keysJa','keyAudio','hint','hintWord','hintWordJa'];

// ============================================================
// TRANSFORM: ここだけ書き換える。
// scenes（175件の配列）を受け取り、変更後の配列を返す。
// 例1) フィールド追加:
//   const data = require('./new_field_data.js'); // [{cat,title,newField},...]
//   const byKey = {}; scenes.forEach((s,i)=>byKey[`${s.cat}||${s.title}`]=i);
//   data.forEach(d=>{
//     const idx = byKey[`${d.cat}||${d.title}`];
//     if(idx===undefined) throw new Error('missing: '+d.title);
//     scenes[idx].newField = d.newField;
//   });
//   return scenes;
// 例2) シーン1:1入れ替え: 置き換え先indexを byKey で特定して scenes[idx]=newScene;
// ============================================================
function TRANSFORM(scenes) {
  throw new Error('TRANSFORMを実装してから実行すること');
}

// ============================================================
// 以下は触らない
// ============================================================
function extractScenes(content) {
  const start = content.indexOf('const ROLEPLAY_SCENES=[');
  if (start === -1) throw new Error('ROLEPLAY_SCENES not found');
  let depth = 0, end = -1;
  const arrStart = content.indexOf('[', start);
  for (let i = arrStart; i < content.length; i++) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  return { scenes: eval(content.slice(arrStart, end + 1)), arrStart, end };
}

function serializeScene(s) {
  const known = FIELD_ORDER.filter(k => k in s);
  const unknown = Object.keys(s).filter(k => !FIELD_ORDER.includes(k));
  if (unknown.length) throw new Error(`FIELD_ORDERに無いフィールド: ${unknown.join(',')}（FIELD_ORDERへ追加してから実行）`);
  return `{${known.map(k => `${k}:${JSON.stringify(s[k])}`).join(',')}}`;
}

function validate(scenes, label) {
  if (scenes.length !== 175) throw new Error(`${label}: count ${scenes.length} != 175`);
  const cats = {};
  scenes.forEach(s => cats[s.cat] = (cats[s.cat] || 0) + 1);
  Object.entries(cats).forEach(([c, n]) => { if (n !== 25) throw new Error(`${label}: cat ${c} has ${n} != 25`); });
  const uniq = new Set(scenes.map(s => `${s.cat}||${s.title}`));
  if (uniq.size !== 175) throw new Error(`${label}: duplicate titles (${175 - uniq.size})`);
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');
const { scenes, arrStart, end } = extractScenes(content);
validate(scenes, 'pre');

// 実物のフィールド順とFIELD_ORDERの整合を検証（既知フィールドの相対順序が一致すること）
const sampleKeys = Object.keys(scenes[0]).filter(k => FIELD_ORDER.includes(k));
const expected = FIELD_ORDER.filter(k => sampleKeys.includes(k));
if (JSON.stringify(sampleKeys) !== JSON.stringify(expected)) {
  throw new Error(`FIELD_ORDERが実物と不一致:\n 実物: ${sampleKeys}\n 期待: ${expected}`);
}

const newScenes = TRANSFORM(scenes);
validate(newScenes, 'post');

const newArrText = '[\n' + newScenes.map(serializeScene).join(',\n') + ']';
if (process.env.DRY_RUN) {
  console.log('DRY_RUN: OK（書き込みなし）。post検証まで合格。');
} else {
  fs.writeFileSync(INDEX_PATH, content.slice(0, arrStart) + newArrText + content.slice(end + 1));
  console.log('OK: wrote', newScenes.length, 'scenes');
  console.log('次: 視点A/B/C（npm run verify + git diffで対象外フィールド無変化の確認）を必ず実行');
}
