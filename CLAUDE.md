# TOP BINS — Claude Code ルール集

サッカー現場英語学習PWA。単一HTMLファイル（`index.html`）+ Vercel Serverless（`api/`）+ Supabase。

**方針**: このファイルには「コードから読み取れないルール・意図・事故の教訓」だけを書く。コードの現状スナップショット（Sオブジェクトの中身、CSS変数値、関数実装など）は載せない — 必ずドリフトして嘘になるため、実物を読むこと。

---

## アーキテクチャの鉄則

- **単一ファイル**: HTML/CSS/JSはすべて `index.html` に収める。外部JSファイルは作らない（例外: `sw.js` と `api/*.js`）。
- **状態管理**: `S` オブジェクトが唯一の永続化状態。変更後は必ず `save()`。フィールドを増やすときは **2箇所のデフォルト定義**（`let S={...}` と `load()` 内の `Object.assign` 初期値）の両方に追加する。
- **画面遷移**: `go(id, dir)`。`dir` は `'push'`/`'pop'`。
- **Supabase**: テーブル `user_progress`（`user_id`, `progress`, `updated_at`）。`save()` でS全体をupsert。anon keyは `index.html` にハードコード（これは正常。RLS前提）。
- **デザイントークン**: 色・radius等は `index.html` の `:root` を参照。フォントは Barlow（英数）+ Noto Sans JP。ダークテーマ固定。

---

## APIキー（最重要・鉄則）

**外部APIキー（Anthropic・OpenAI等）は絶対にクライアント側コード（`index.html`）に書かない。** 過去に難読化ハードコードされたOpenAIキーがView Sourceから丸見えになる事故があった。

- 外部AI呼び出しは必ず `api/*.js`（Vercel Serverless Function）経由。キーはVercel環境変数（`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`）。
- 現在のプロキシ: `api/coach.js`（Anthropic）/ `api/transcribe.js`（Whisper）/ `api/score.js`（採点）/ `api/_guard.js`（共通のOrigin検査＋簡易レート制限。`_`始まりはVercelがルート化しない）。
- 新しい外部AI連携は必ず `api/` にプロキシを立て、`guard(req,res)` を通す。
- `_guard.js` の許可ドメインはホスト名パターン判定（topbins.vercel.app / sports-solution*.vercel.app / localhost）。カスタムドメインを追加したら `isAllowedHost()` も更新すること。

---

## 音声（ElevenLabs）

- **ボイス**: Eastend Steve（`1TE7ou3jyxHsyRehUuMB`）/ `eleven_multilingual_v2` / stability=1.0, similarity_boost=1.0, style=0.0, speaker_boost=on, speed=1.0
- **ファイル名ルール**: 全て小文字。記号 `!?',./—–` を除去、スペース→`_`。変換ロジックは `index.html` の `textToAudioSrc()` と `scripts/elevenlabs_generate.js` の `toFilename()` の2箇所にあり、**この2つは常に同一の変換結果を返すよう同期させる**（片方だけ変えるとmp3が見つからず音が鳴らなくなる）。
- **単語カード・クイズ・フレーズカード**は `textToAudioSrc()` で表示テキストから動的変換。**ROLEPLAYのみ** `audio`/`keyAudio` キーでファイル名を明示管理（表示テキストの表記揺れによる不一致事故を防ぐため）。
- 生成手順: `scripts/phrases_to_record.txt` にフレーズ追記 → `ELEVEN_API_KEY=xxx node scripts/elevenlabs_generate.js`（`--dry-run` / `--force` あり）。
- 新規ROLEPLAYシーン追加時: エントリに `audio`・`keyAudio`・`hint` を必ず設定 → フレーズを phrases_to_record.txt に追記 → 生成 → validate。

### 音声整合性チェック（push前に必須）

```bash
node scripts/validate_audio.js
```

音声・シーンデータを触ったら必ず実行し、OKになってから commit/push。ROLEPLAYの `audio`/`keyAudio`/`hint` の存在・数一致・mp3実在と、全 `en:` フィールドの変換後mp3実在を検証する。

---

## ROLEPLAY_SCENES を機械的に加工する際の鉄則

hintフィールドが175シーン全部でズレて本番に出た事故がある。同じ轍を踏まないこと。

1. 配列の抽出は**必ずブラケット対応（bracket matching）**で行う。正規表現の非貪欲マッチ（`[\s\S]*?\];`）は途中で切れて古い一覧を掴む。
2. 一括挿入・置換は、**使ったリストと実ファイルを title で1:1照合してから**書き込む。
3. 加工後は**3視点レビュー**を通してから commit/push:
   - **データ整合性**: シーン総数175・カテゴリ内訳（7×25）・title集合が加工前後で完全一致（スクリプトで機械検証）
   - **意味・文脈**: 数シーン抜き出して situation/line/keys と突き合わせ、値や並び順が意味的に正しいか確認
   - **音声整合性**: `validate_audio.js` が0件エラー & 加工対象外フィールドが `git diff` 上で無変化
4. 175シーン全体に及ぶ大規模加工では、上記に加えて**独立エージェント**（この会話の文脈を持たないExplore/general-purpose）に最低1視点（特にデータ整合性）を検証させる。

---

## 主要モードの設計意図

- **ROLEPLAY = キャリアモード**: 7カテゴリ×25シーンを「Day 1〜25」で横断提示。各Dayは各カテゴリのindex Nを1つずつ集めた7シーン。**カテゴリ配列の並び順がそのままキャリア時系列**（media/agentは初期→終盤に並び替え済み）なので、シーンを追加・並び替えるときは位置がDayを意味することを忘れない。前Day完了で次Dayが解放（`rpDayUnlocked`）。進捗は `S.rpCompletedSceneKeys` から導出し、専用フィールドは持たない。
- **MATCHDAY**: 1日1問・MATCH TICKET制（最大3枚）。**失敗駆動復習**: AI採点<50で `S.mdReviewQueue` に登録（初回失敗→翌日、再失敗→3日後）、≥50で卒業。`shuffleMd()` は復習期限が来たシーンを最優先で出題。シーンのキーは `${cat}||${title}` 形式で統一。
- **ミッション**: 1日4ミッション（フレーズ・クイズ・シャドーイング・単語カード）。全完了で `checkMissionBonus()` がTICKET+1。
- **MAKE IT YOURS（Dayの締め）**: サブ理念「自分事に置き換えて覚える」（自己関連付け効果＋生成効果）の実装。Day完了時に今日のフレーズ1つの「形」を借りて自分の本当のことを発声→Whisper認識→AIが文法チェック（`/api/score` 経由）→修正版を `S.myPhrases` に既存形式 `{c,en,ja,ex,exJa,note}` で保存（単語カードの「マイフレーズ」デッキに自動還流）。**ユーザー発話側のみなので事前生成mp3は不要**という制約回避が設計の核。聞き直しは録音Blob（コストゼロ）＋ブラウザTTSお手本。スキップ可・強制しない。

---

## Service Worker（`sw.js`）

- アプリシェル（`/`, `index.html`, `manifest.json`）= **network-first**（cache-firstにするとデプロイが反映されなくなる）。
- `audio/`・`images/` = **cache-first**（再生したものだけ順次キャッシュ。62MB全件の事前DLはしない）。
- `/api/*` は**一切インターセプトしない**。
- シェルの挙動を変えたらキャッシュ名 `topbins-shell-v1` / `topbins-runtime-v1` のバージョンを上げる（activateで旧キャッシュ自動削除）。

---

## UI・実装の注意

- **絵文字は一切使わない。アイコンは必ずSVG**（トースト等も例外なし）。対象は10〜20代、英語コーチング×サッカーの熱量。
- **onclick属性に特殊文字を渡さない**: テキストはグローバル配列に入れてインデックスだけ渡す（`onclick="mdSelect(0)"`）。`encodeURIComponent` 等を属性内に直書きするとパースエラー。
- **CSS specificity**: 画面表示は `#id.active { display:... }` のように `.active` を組み合わせる（IDセレクタ単体は `.screen { display:none }` に負けることがある）。
- 音声再生は `playMp3(src, text, r, cat)` / MATCHDAYは `mdPlaySrc(src)`。ファンファーレはWebAudio API（外部ライブラリ不使用）。
- **自分の声の聞き直しは全録音モード共通**: `keepRec(blob)` / `playMyVoice()` / `myVoiceBtn(sm)` の共通ヘルパーを使う（端末内Blob再生・APIコストゼロ）。**新しい録音フローを作ったら必ず onstop で `keepRec(blob)` を呼び、結果画面に `myVoiceBtn()` を置く**。個別のBlob管理を作らないこと。

---

## デプロイ

- `main` にpushするとVercelが自動デプロイ。確認は vercel.com。
- push前チェックリスト: ①構文チェック（scriptブロックを `new Function` で検証）②音声/シーンを触ったら `validate_audio.js` ③ROLEPLAY_SCENES加工時は3視点レビュー。
