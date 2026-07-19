# TOP BINS — Claude Code ルール集

サッカー現場英語学習PWA。単一HTMLファイル（`index.html`）+ Vercel Serverless（`api/`）+ Supabase。

**このファイルの書き方（自分ルール）**:
- ここには「今後の作業で守るルール」だけを書く。1項目=数行以内。
- 設計の経緯・却下した代替案・事故の詳細・日付つきの意思決定は `docs/design-log.md` に書く（「なぜこの設計？」と思ったらそちらを読む）。機能を実装したら記録はdesign-logへ追記し、CLAUDE.mdには**新しく守るべきルールが生まれた場合だけ**足す。
- コードの現状スナップショット（Sの中身、イベント一覧、関数実装）は書かない — ドリフトして嘘になる。実物を読む。
- 手順が長い作業はスキル化する（例: `roleplay-scene-edit`）。曖昧な判断を伴う一括作業（分類・命名・翻訳等）は、文脈を全部詰めた自己完結プロンプトでサブエージェントに投げると精度が安定する。

---

## アーキテクチャの鉄則

- **単一ファイル**: HTML/CSS/JSはすべて `index.html` に収める。外部JSファイルは作らない（例外: `sw.js` と `api/*.js`）。
- **状態管理**: `S` オブジェクトが唯一の永続化状態。変更後は必ず `save()`。フィールドを増やすときは **2箇所のデフォルト定義**（`let S={...}` と `load()` 内の `Object.assign` 初期値）の両方に追加する。
- **画面遷移**: `go(id, dir)`。`dir` は `'push'`/`'pop'`。idは`scr-`プレフィックスを除いた名前で渡す。
- **Supabase**: テーブル `user_progress`。`save()` でS全体をupsert。anon keyは `index.html` にハードコード（RLS前提で正常）。
- **デザイントークン**: 色・radius等は `:root` を参照。フォントは Barlow + Noto Sans JP。ダークテーマ固定。

## APIキー（最重要）

- **外部APIキー（Anthropic・OpenAI等）は絶対にクライアント側コード（`index.html`）に書かない**（過去にView Source露出事故あり）。
- 外部AI呼び出しは必ず `api/*.js` 経由。キーはVercel環境変数。新しい外部AI連携は必ず `api/` にプロキシを立て `guard(req,res)` を通す。
- `_guard.js` の許可ドメインはホスト名パターン判定。カスタムドメインを追加したら `isAllowedHost()` も更新する。

## entitlement（無料/Pro権限）

- **entitlementは絶対にSに混ぜない**: `S`に入れると`save()`経由でクライアントが自分の権限を改ざんできる。`entitlements`テーブル（RLSでselectのみ）＋Supabaseダッシュボードから手動セットで運用。招待コード等の自己申告制にしない。
- PWAは`entitled`常時true。ネイティブ判定（`isNativePlatform()`）時のみ`checkEntitlement()`がテーブルを参照。
- entitled分岐は現状すべてクライアント側のみ（サーバ側クォータは意図的に未実装、IAP実装と同時にやる）。分岐を足すときは既存パターン（`openMatchday()`等）を踏襲。

## 行動計測・プッシュ通知

- 外部SaaSは使わない（アナリティクスはSupabase `events`テーブル、通知はWeb Push＋Vercel Cron）。
- **`track()`は必ずfire-and-forget**: エラーを握りつぶす。計測の失敗がUXを壊してはいけない。現在のイベント一覧はコードの`track(`呼び出しを検索。
- A/Bテストは`experimentVariant()`（ユーザーIDハッシュで決定論的）。使うときは`track()`のpropsに`{experiment, variant}`を含める。
- **2箇所同期の罠**: ①VAPID公開鍵（`index.html`と`api/send-review-notifications.js`）、②バリアント振り分けハッシュ（`experimentVariant()`と`pickVariant()`）。片方だけ変えると壊れる。
- プッシュ許可はDay1完了直後にだけ自動で聞く（`S.pushPromptShown`で一度きり）。購読410/404は該当行を自動削除。

## 音声（ElevenLabs）

- **ボイス**: Eastend Steve（`1TE7ou3jyxHsyRehUuMB`）/ `eleven_multilingual_v2` / stability=1.0, similarity_boost=1.0, style=0.0, speaker_boost=on, speed=1.0
- **ファイル名変換は2箇所同期**: `index.html`の`textToAudioSrc()`と`scripts/elevenlabs_generate.js`の`toFilename()`は常に同一結果を返すこと。
- カード・クイズ系は`textToAudioSrc()`で動的変換、**ROLEPLAYのみ**`audio`/`keyAudio`で明示管理。
- 生成手順: `scripts/phrases_to_record.txt`に追記 → `ELEVEN_API_KEY=xxx node scripts/elevenlabs_generate.js`（`--dry-run`/`--force`あり）。
- **`en:`というキー名は音声必須と判定される**: `validate_audio.js`が全ファイル横断でスキャンするため、音声を持たないテキストフィールドに`en:`を使わない（MIYチップは`eng:`、ROLEPLAYヒントは`hintWord`等）。
- `bulkDownloadAudio()`のファイル名は必ず`encodeURIComponent()`してから`fetch()`（`%`・`\`入りファイル名の400事故実績あり）。

## ROLEPLAY_SCENES の加工

- **必ず `roleplay-scene-edit` スキルを使う**（追加・並び替え・フィールド一括変更すべて）。正規表現の誤抽出で175シーン全部がズレて本番に出た事故がある。手順・レビュー体制はスキル側に一本化。
- Day構造は`175=7カテゴリ×25`が前提。シーンを増減するとDay構造とMATCHDAY出題プールが壊れるため、原則は既存シーンとの1:1入れ替え。
- 新規シーン追加時は`audio`・`keyAudio`・`hint`必須 → phrases_to_record.txtに追記 → 生成 → `npm run verify`。

## 主要モードの構造（詳細な設計意図は docs/design-log.md）

- **ROLEPLAY = キャリアモード**: Day 1〜25、各Dayは7カテゴリのindex Nを1つずつ。**カテゴリ配列の並び順がそのままキャリア時系列**。Day解放は完了ベースのみで日付ゲートはない（UI文言で日付ゲートがあるように見せない — 過去に実態と違う表示の事故あり）。進捗は`S.rpCompletedSceneKeys`から導出。
- **Mastery Rank**: Tier1=BRONZE（3択）→2=SILVER（自由回答+ヒント）→3=GOLD（単語ヒントのみ）→4=TOP BINS（支援なし+スピードゲート）。**合格(50+)かつ現習熟度超えでのみ昇格、失敗しても下がらない**。ヒント使用は昇格をブロックしない（厳格化するなら`hint`フラグ付き昇格データのベースレートを見てから）。
- **MATCHDAY**: 1日1問・チケット制。AI採点<50で`S.mdReviewQueue`登録（翌日→3日後）、≥50で卒業。出題プールは**ROLEPLAY完了済みシーンのみ**。シーンキーは`${cat}||${title}`形式で統一。
- **足場かけの原則**: 初級者（`S.selfLevel==='beginner'`）ほど手厚く（ヒントデフォルト展開・MATCHDAY遅延・単語肩慣らし）、Tierが上がるほど弱める。新しい学習UIを作るときはこの勾配を崩さない。
- **MAKE IT YOURS**: 日本語の質問+型の穴埋め→AI変換→音読→`S.myPhrases`へ保存。AI変換のプロンプトにはチップ語彙を渡し、ヒントで見せた英語表現と変換結果を一致させる。

## Service Worker（`sw.js`）

- アプリシェル = **network-first**（cache-firstにするとデプロイが反映されない）。`audio/`・`images/` = **cache-first**。`/api/*`は**一切インターセプトしない**。
- シェルの挙動を変えたらキャッシュ名（`topbins-shell-v1`/`topbins-runtime-v1`）のバージョンを上げる。

## UI・実装の注意

- **絵文字禁止・アイコンはSVG**。`npm run verify`が機械チェック。許可リスト（`✓ ✕ ☆ ★ ⭐`）は既存の機能ボタンのみの例外で、新規コードで使わない・増やさない。
- **onclick属性に特殊文字を渡さない**: テキストはグローバル配列に入れてインデックスだけ渡す。
- **CSS specificity**: 画面表示は`#id.active{display:...}`のように`.active`を組み合わせる（ID単体は`.screen{display:none}`に負けることがある）。
- **採点結果画面ではスコア確定直後に必ず`sfx(passed?'good':'bad')`**: 派手な演出（`showCelebration()`等）は基本フィードバックの代わりにならない（両方鳴らす）。`sfx()`が音と振動を一元管理。
- **録音フローの必須パターン**（過去の事故はdesign-log参照）:
  - onstopで必ず`keepRec(blob)`、結果画面に`myVoiceBtn()`（個別のBlob管理を作らない）。
  - 停止処理は`state==='inactive'`分岐必須: inactiveならフラグを立てずその場で失敗扱いの結果表示へ（さもないとonstopが発火せず操作不能で固まる）。
  - 開始/停止は`toggleXxxRec()`型の単一エントリポイント（onclick固定）を優先。onclickを直接swapする場合は停止・分岐の**全箇所**で元に戻す。
  - 画面描画開始時に録音系フラグをリセットする安全網を入れる。
  - Whisper呼び出しは共通の`_transcribeAudio()`（20秒タイムアウト内蔵）を使う。
- **ビューポート高さは`100svh`**（`100dvh`はブラウザツールバー表示時に実可視範囲より大きく計算され、スクロール不能事故を起こした）。
- **オンボーディングは文脈型の一言ヒントのみ**: `hintBanner(id,text)`＋`S.seenHints`のパターンを踏襲。大きなチュートリアル画面は作らない。

## デプロイ

- `main`にpushするとVercelが自動デプロイ。**push前は必ず`npm run verify`**（構文＋絵文字＋音声整合性＋manifest再生成）。
- ROLEPLAY_SCENESを加工した場合は`roleplay-scene-edit`スキルの3視点レビューも通す。
