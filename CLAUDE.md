# TOP BINS — Claude Code ルール集

## プロジェクト概要
サッカー現場英語学習PWA。単一HTMLファイル構成（`index.html`）+ Supabaseバックエンド。

---

## アーキテクチャ

- **単一ファイル**: すべてのHTML/CSS/JSは `index.html` 1ファイルに収める。外部JSファイルは作らない。
- **状態管理**: `S` オブジェクトで全状態を管理。変更後は必ず `save()` を呼ぶ。
- **画面遷移**: `go(id, dir)` を使う。`dir` は `'push'`（前進）または `'pop'`（戻る）。
- **ホーム描画**: `renderHome()` → `#home-hero-area` と `#home-session-area` に innerHTML を注入。

---

## Sオブジェクト（永続化状態）

```js
let S={
  min:0, caps:0, goals:0, streak:0, last:"", box:{}, trophies:[],
  speakCount:0, combo:0, doneToday:"", myPhrases:[], pitchRight:0,
  pitchTotal:0, lockerRight:0, lockerTotal:0, history:[], tickets:0,
  lastQuizDate:"", lastLockerQuizDate:"", lastSpeakDate:"",
  position:"", name:"", totalXP:0, matchdayDate:"", matchdayCount:0,
  matchTickets:1, cardsSinceTicket:0
};
```

---

## CSSカスタムプロパティ

```css
:root {
  --green: #1D9E75;
  --green-dk: #0d6b4d;
  --green-lt: rgba(29,158,117,.14);
  --ink: #EEF4F1;        /* 主テキスト */
  --bg: #0f1711;         /* ページ背景 */
  --white: #192419;      /* カード背景（第1層） */
  --card2: #213020;      /* カード背景（第2層） */
  --yellow: #FFC400;
  --red: #E2493B;
  --grey: #7A9488;
  --border: rgba(100,200,150,.14);
  --border2: rgba(120,220,165,.22);
  --radius: 18px;
  --shadow: 0 2px 20px rgba(0,0,0,.5);
}
```

- フォント: `Barlow` (英数) + `Noto Sans JP` (日本語)
- ベース背景: `--bg` / カード: `--white` / ネストカード: `--card2`

---

## Supabase

```js
const SUPA_URL = "https://gsfqozfambpaufijhktf.supabase.co";
// SUPA_KEY は index.html 内にハードコード済み（anon key）
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);
```

- CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- テーブル: `progress`（カラム: `uid`, `data`）
- `save()` でSオブジェクト全体をupsert、`load()` で復元

---

## ElevenLabs 音声生成

**ボイス**: Eastend Steve（Voice ID: `1TE7ou3jyxHsyRehUuMB`）  
**モデル**: `eleven_multilingual_v2`  
**設定**: stability=1.0, similarity_boost=1.0, style=0.0, use_speaker_boost=true, speed=1.0

### ファイル名ルール

**すべて小文字**で生成・参照する。変換ロジックは以下で統一：

```js
// index.html 内 textToAudioSrc() — 再生時のパス生成
function textToAudioSrc(text) {
  return "audio/" + text.toLowerCase().replace(/[!?',.\/]/g,"").replace(/\s+/g,"_").replace(/_+/g,"_") + ".mp3";
}

// scripts/elevenlabs_generate.js 内 toFilename() — 生成時のファイル名
function toFilename(text) {
  return text.toLowerCase().replace(/[!?',.\/]/g,'').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') + '.mp3';
}
```

- 記号 `!?',.\/` はファイル名から除去される
- スペースは `_` に変換
- 特殊文字（em dash `—` など）はファイル名が崩れるので使わない
- ハイフン `-` はそのまま残る（例: `ball-watcher` → `ball-watcher`）

### ROLEPLAYシーンのaudio/keyAudioキー設計

**ROLEPLAYシーンは表示テキストとファイル名を分離するため、`audio`・`keyAudio` キーを明示的に持つ。**

```js
// ROLEPLAY_SCENES の各エントリ構造
{
  cat: 'pitch',
  title: '走り込め',
  situation: '...',
  npc: 'Captain',
  line: "Get in behind! Don't be a ball-watcher, make the run!",  // 表示・発話テキスト（正しい英語大文字）
  audio: 'get_in_behind_dont_be_a_ball-watcher_make_the_run',     // ← lineのファイル名キー（小文字）
  keys: ["Yes, I'm making the run!", "On it, going behind!", "Got it, I'm moving now!"],  // 選択肢テキスト
  keyAudio: ['yes_im_making_the_run', 'on_it_going_behind', 'got_it_im_moving_now'],      // ← keysのファイル名キー
}
```

**設計の理由**: `textToAudioSrc()` によるテキスト→ファイル名の動的変換は、表記の揺れ（大文字・記号の有無）でファイル名不一致が起き音が鳴らなくなるリスクがある。`audio`/`keyAudio` キーで対応関係を固定することでこれを防ぐ。

**新規ROLEPLAYシーン追加時の手順**:
1. `ROLEPLAY_SCENES` にエントリを追加（`audio`・`keyAudio` キーを必ず設定）
2. `audio`・`keyAudio` の値は `toFilename()` と同じ変換ルールで生成（小文字・記号除去・スペース→`_`）
3. `scripts/phrases_to_record.txt` に `line` と `keys` の各フレーズを追記
4. `ELEVEN_API_KEY=xxx node scripts/elevenlabs_generate.js` で生成

### 音声生成手順

```bash
# 1. scripts/phrases_to_record.txt にフレーズを追記
# 2. 生成実行
ELEVEN_API_KEY=xxx node scripts/elevenlabs_generate.js

# オプション
# --dry-run  : 対象ファイル一覧のみ表示（生成しない）
# --force    : 既存ファイルも上書き再生成
```

- 出力先: `audio/*.mp3`
- **単語カード・クイズ・フレーズカードは `textToAudioSrc()` で動的変換（既存ファイルはすべて小文字）**
- **ROLEPLAYのみ `audio`/`keyAudio` キーで明示管理**

---

## デプロイ

- **Vercel自動デプロイ**: `main` ブランチにpushすると自動でデプロイされる
- 確認: Vercelダッシュボード（vercel.com）
- `.vercel/` はgitignore済み

---

## UIルール

### 基本方針
- 10〜20代の若者向け。英語コーチング × サッカーの熱量。
- ダークテーマ固定。ネオン/グロウ演出あり。
- **絵文字は一切使わない。アイコンが必要な場合は必ずSVGで実装する。**（コード内のトースト等も含め例外なし）

### ミッションカード（`.mission-card`）
- 3枚構成: 今日の３フレーズ → クイズ10選 → シャドーイング
- アイコン背景色:
  - フレーズ: `rgba(255,215,0,.12)` (金)
  - クイズ: `rgba(29,158,117,.15)` (緑)
  - シャドーイング: `rgba(103,58,183,.2)` (紫)
- 完了済みは `.done-card` クラス + `✓` チェック表示

### ヒーロー統合カード（`.home-unified-card`）
- ストリーク日数 + 日本語グリーティング + 進捗リング + 週ドット
- 週ドット: 12px、完了=`#FF6B00`、今日完了=`#FFD700`
- 英語コピーなし。日本語1行グリーティングのみ。

### MATCHDAYカード
- 1日1問制限（`S.matchdayCount >= 1` で完了扱い）
- MATCH TICKET制: 最大3枚、クイズ/シャドーイング/単語カードで獲得

### CSS specificity注意
- `#id.active { display: flex }` のように `.active` を組み合わせる（IDセレクタ単体は `.screen { display: none }` に負ける場合がある）

---

## onclick属性の注意

- onclick属性内で `encodeURIComponent` や特殊文字を直接使うとパースエラーになる
- 選択肢などは グローバル配列（例: `mdCurrentChoices[]`）に格納し、インデックスだけ渡す

```js
// NG
onclick="mdSelect('${encodeURIComponent(text)}')"

// OK
mdCurrentChoices = [...];
// onclick="mdSelect(0)"
```

---

## 音声再生

- `playMp3(src, text, r, cat)` で再生
- Matchday用: `mdPlaySrc(src)`
- WebAudio APIで勝利ファンファーレ（外部ライブラリ不使用）
