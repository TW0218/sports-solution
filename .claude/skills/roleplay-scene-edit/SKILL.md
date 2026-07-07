---
name: roleplay-scene-edit
description: Use when adding, reordering, bulk-editing fields on, or otherwise machine-processing entries in the ROLEPLAY_SCENES array in index.html (TOP BINS / sports-solution project). Covers safe extraction, verification, and the mandatory review protocol that prevents silent data corruption across the 175-entry array.
---

# ROLEPLAY_SCENES 一括加工プロトコル

`index.html` の `ROLEPLAY_SCENES`（175エントリ、7カテゴリ×25シーン）を機械的に加工するときの手順。**過去に正規表現の非貪欲マッチで配列を誤抽出し、hintフィールドが全175シーンでズレて本番に出た事故がある。** この手順はその再発防止策であり、省略しないこと。

## 1. 配列の抽出は必ずブラケット対応で行う

正規表現の非貪欲マッチ（`[\s\S]*?\];` 等）は途中の `];` で誤って切れ、古い・ズレた一覧を掴む。必ず以下のパターンで抽出する:

```js
const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const start = content.indexOf('const ROLEPLAY_SCENES=[');
let depth = 0, end = -1;
for (let i = content.indexOf('[', start); i < content.length; i++) {
  if (content[i] === '[') depth++;
  else if (content[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const scenes = eval(content.slice(content.indexOf('[', start), end + 1));
if (scenes.length !== 175) throw new Error('scene count ' + scenes.length); // 抽出直後に即検証
```

## 2. 加工は「title で1:1照合」してから書き込む

生成したリスト（新フィールドの値、並び替え後の順序など）を実ファイルにマージする前に、**必ず `${cat}||${title}` キーで1:1照合**する。数が合わない・存在しないtitleがある場合はエラーで止める。例（並び替えの場合）:

```js
function reorderCat(scenes, cat, order) {
  const byTitle = {};
  scenes.filter(s => s.cat === cat).forEach(s => { byTitle[s.title] = s; });
  if (Object.keys(byTitle).length !== order.length) throw new Error(cat + ' count mismatch');
  const missing = order.filter(t => !byTitle[t]);
  if (missing.length) throw new Error(cat + ' missing titles: ' + missing.join(', '));
  const extra = Object.keys(byTitle).filter(t => !order.includes(t));
  if (extra.length) throw new Error(cat + ' extra titles: ' + extra.join(', '));
  return order.map(t => byTitle[t]);
}
```

フィールド追加の場合も同様に、生成したリストの `{i, title, ...}` と実ファイルの `scenes[i].title` を突き合わせてから書き込む。**リストの生成順とファイルの実際の並びが一致している保証はない**という前提で扱うこと。

## 3. 書き込み後は「3視点セルフレビュー」を必ず通す

commit/push前に、以下3つを**全て**実行し、1つでも引っかかったらやり直す。

### 視点A: データ整合性
```bash
node -e "
const fs=require('fs');
const content=fs.readFileSync('index.html','utf8');
const start=content.indexOf('const ROLEPLAY_SCENES=[');
let depth=0,end=-1;
for(let i=content.indexOf('[',start);i<content.length;i++){
  if(content[i]==='[')depth++;else if(content[i]===']'){depth--;if(depth===0){end=i;break;}}
}
const scenes=eval(content.slice(content.indexOf('[',start),end+1));
const cats={};scenes.forEach(s=>cats[s.cat]=(cats[s.cat]||0)+1);
console.log('total:',scenes.length,JSON.stringify(cats));
console.log('unique titles:',new Set(scenes.map(s=>s.cat+'||'+s.title)).size);
"
```
期待値: `total: 175`、各カテゴリ25、`unique titles: 175`。

### 視点B: 意味・文脈
加工結果（並び順・新フィールドの値など）を数シーン抜き出し、`situation`/`line`/`keys` と突き合わせて意味的に整合しているか目視確認する。機械的な検証だけでは「数は合っているが中身がズレている」事故を防げない。

### 視点C: 音声整合性 + 対象外フィールド無変化
```bash
npm run verify
```
これで構文チェック＋`validate_audio.js`（`audio`/`keyAudio`/`hint`の存在・数一致・mp3実在）が通る。加えて、**加工対象でないフィールド（audio/keyAudio/keys等）が意図せず変化していないか** `git diff` で目視確認する。

## 4. 規模に応じたエスカレーション

- **〜50シーン程度**の並び替え・限定的な変更: 上記の自己3視点レビューで十分。
- **175シーン全体**に及ぶ一括加工（新フィールドの全件追加、大規模な構造変更など）: 自己レビューに加えて、この会話の文脈を持たない独立エージェント（Explore/general-purposeエージェント）に最低1視点（特に視点A）を独立検証させる。自分の思い込みによる見落としは自己レビューだけでは防げない。

## 5. 最終ゲート

`npm run verify` が通り、3視点とも問題なければ commit/push してよい。
