# TOP BINS — Claude Code ルール集

サッカー現場英語学習PWA。単一HTMLファイル（`index.html`）+ Vercel Serverless（`api/`）+ Supabase。

**方針**: このファイルには「コードから読み取れないルール・意図・事故の教訓」だけを書く。コードの現状スナップショット（Sオブジェクトの中身、CSS変数値、関数実装など）は載せない — 必ずドリフトして嘘になるため、実物を読むこと。手順が長くなる作業（ROLEPLAY_SCENES加工など）はスキル化してこのファイルへの記憶依存を減らす。分類・命名・文章生成のような曖昧な判断を伴う一括作業は、必要な文脈を全部詰めた自己完結プロンプトでサブエージェントに投げると精度が安定する。

---

## アーキテクチャの鉄則

- **単一ファイル**: HTML/CSS/JSはすべて `index.html` に収める。外部JSファイルは作らない（例外: `sw.js` と `api/*.js`）。
- **状態管理**: `S` オブジェクトが唯一の永続化状態。変更後は必ず `save()`。フィールドを増やすときは **2箇所のデフォルト定義**（`let S={...}` と `load()` 内の `Object.assign` 初期値）の両方に追加する。
- **画面遷移**: `go(id, dir)`。`dir` は `'push'`/`'pop'`。
- **Supabase**: テーブル `user_progress`（`user_id`, `progress`, `updated_at`）。`save()` でS全体をupsert。anon keyは `index.html` にハードコード（これは正常。RLS前提）。
- **デザイントークン**: 色・radius等は `index.html` の `:root` を参照。フォントは Barlow（英数）+ Noto Sans JP。ダークテーマ固定。

---

## PWA / Apple App 併存方針

PWA（topbins.vercel.app、常時無料）とApple App（審査・課金対応、将来Capacitorでラップ予定）を**同一の`index.html`で並行維持する**。PWAを残す理由は無料配布だけでなく、Vercel即時デプロイによる開発速度（Apple Appは更新のたび審査が挟まる）。

- **entitlement（無料権限）はSの外に置く**: `entitlements`テーブル（`user_id`, `is_complimentary`）はRLSでselectのみ許可、insert/update/deleteはSupabaseダッシュボード（service_role）経由のみ。`S`に含めると`save()`経由でクライアントが自分の権限を改ざんできてしまうため、絶対にSに混ぜない。テーブル定義は`supabase/entitlements.sql`。
- **選手・身内への無料付与は招待コード等の自己申告制にしない**: Supabaseダッシュボードで`is_complimentary=true`を手動セットする運用（非エンジニアにとって最も操作が少なく確実）。
- **`isNativePlatform()`**（`window.Capacitor?.isNativePlatform?.()`）で実行環境を判定。PWAは常にfalseを返すため`entitled`は常時true（=常に無料のまま、分岐の影響を受けない）。ネイティブ判定時のみ`checkEntitlement()`が`entitlements`テーブルを参照する。
- 現時点でペイウォールUIやIAPは未実装（土台のみ）。Apple提出前に必須の別対応（新規登録フロー・アカウント削除・プライバシーポリシー/利用規約・マイク使用の第三者送信開示）はまだ手つかず。

---

## 行動計測（自前実装・外部SaaS不使用）

外部アナリティクスSaaSは使わず、Supabaseの`events`テーブルに一本化している（プライバシーポリシー未整備の段階で新しい第三者にデータを渡さないため。詳細な議論の経緯はプロジェクトの会話履歴を参照）。

- **`track(name, props)`**: 汎用イベント記録。`events`テーブルはRLSで**insertのみ許可**（selectポリシーは意図的に作らない）。分析はSupabaseダッシュボードのSQL Editorから`supabase/analytics_queries.sql`のクエリで行う。テーブル定義は`supabase/events.sql`。
- **必ずfire-and-forget**: `track()`はエラーを握りつぶす。計測の失敗が絶対にユーザー体験を壊してはいけない。新しいイベントを足すときもこの原則を破らないこと。
- **計測イベント一覧**: `app_open`（ログイン成功時・セッション復元時）/ `day_complete`（ROLEPLAY Day完了、`day`と`avg_score`）/ `matchday_played`（`score`,`verdict`,`is_review`）/ `mission_complete`（`mission`: pitch_quiz/locker_quiz/cards/shadowing）/ `make_it_yours_complete`・`make_it_yours_skip` / `streak_broken`（`previous_streak`。ストリークが実際に途切れた時のみ、0→1のような初回は含めない）。
- **`experimentVariant(name, variants)`**: ユーザーIDのハッシュ値で決定論的にA/Bバリアントを振り分ける最小実装。外部の実験基盤は使わない。同一ユーザーは常に同じバリアントになる。使うときはtrack()のpropsに`{experiment, variant}`を含めること。

---

## プッシュ通知（復習期限リマインダー）

`S.mdReviewQueue`の`due`日付を外部トリガーとして使う設計。外部通知SaaSは使わず、Web Push＋Vercel Cronのみで完結させている。

- **許可リクエストのタイミング**: インストール直後ではなく**Day 1完了直後**（`renderRPDayComplete()`で`rpDay===0`の時のみ`maybeAskPushPermission()`を呼ぶ）。価値を体験する前に許可を求めると許可率が落ちるため。一度尋ねたら`S.pushPromptShown`で二度と自動では聞かない。
- **VAPID鍵**: 公開鍵はクライアント（`index.html`の`VAPID_PUBLIC_KEY`）と`api/send-review-notifications.js`の両方にハードコード（公開鍵なので問題なし）。秘密鍵はVercel環境変数`VAPID_PRIVATE_KEY`のみに存在する。**この2箇所の公開鍵は常に同じ値で同期させること**（片方だけ鍵を再生成すると購読が壊れる）。
- **購読情報**: `push_subscriptions`テーブル（`supabase/push_subscriptions.sql`）。`entitlements`/`events`と違い、ユーザーが自分の行を書き換える必要があるため`for all`ポリシーで本人のみ許可。
- **送信トリガー**: `api/send-review-notifications.js`を`vercel.json`のCronで1日1回（9:00 UTC = 18:00 JST）呼ぶ。`SUPABASE_SERVICE_ROLE_KEY`で全ユーザーの`mdReviewQueue`を横断的に読み、`due<=today`のユーザーだけに送信する。エンドポイント自体はVercelが自動付与する`Authorization: Bearer $CRON_SECRET`ヘッダで保護（`CRON_SECRET`はVercel環境変数）。
- 購読が410/404で失敗したら（アンインストール・許可取り消し等）該当行を自動削除する。
- **通知文言はパーソナライズ＋A/Bテスト**: `mdReviewQueue`の実データ（シーン名・件数・`fails`）で内容を組み立て、さらに言い回しを2バリアント（A/B）でテストする。バリアント振り分けは`api/send-review-notifications.js`内の`pickVariant()`（`index.html`の`experimentVariant()`と同一アルゴリズムをサーバ側に再実装したもの）。**この2つのハッシュ関数は常に同じロジックを保つこと**（片方だけ変えるとクライアント/サーバでバリアントがズレる）。
- **送信〜クリックの計測ループ**: 送信時は`SUPABASE_SERVICE_ROLE_KEY`でRLSを迂回して`events`に`notification_sent`（`variant`付き）を直接insert。クリック時はプッシュのURLに`?notif=1&notif_variant=X&notif_exp=Y`を付与し、`sw.js`の`notificationclick`が（既存タブがあっても）必ずそのURLへ`navigate`させる。クライアント側は起動時にこのパラメータを見て`notification_clicked`を記録し、`history.replaceState`でURLから消す（`?reset=missions`と同じパターン）。バリアント別CTRは`supabase/analytics_queries.sql`のクエリ8番。

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

### push前チェック（必須）

```bash
npm run verify
```

構文チェック（`index.html`内の全scriptブロック）＋音声整合性チェック（`validate_audio.js`: ROLEPLAYの `audio`/`keyAudio`/`hint` の存在・数一致・mp3実在、全 `en:` フィールドの変換後mp3実在）を1コマンドでまとめて実行する。音声・シーンデータを触ったら必ず実行し、OKになってから commit/push。

---

## ROLEPLAY_SCENES を機械的に加工する際の鉄則

hintフィールドが175シーン全部でズレて本番に出た事故がある。同じ轍を踏まないこと。

**`ROLEPLAY_SCENES`（追加・並び替え・フィールド一括変更など）を触るタスクは、必ず `roleplay-scene-edit` スキルを使う。** ブラケット対応抽出・title 1:1照合・3視点レビュー・規模別エスカレーションの手順一式がそこに定義されている（CLAUDE.mdへの記憶依存を減らすため、詳細な手順書はスキル側に一本化した）。

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

- **絵文字は一切使わない。アイコンは必ずSVG**（トースト等も例外なし）。対象は10〜20代、英語コーチング×サッカーの熱量。`npm run verify`が絵文字混入を機械チェックする（目視レビューだけでは過去に18箇所中9箇所しか見つけられなかった実績があるため）。許可リスト（`✓ ✕ ☆ ★ ⭐`）は機能するボタン/状態アイコンとして使われている既存箇所のみの例外— 新規コードで装飾目的に使わない。許可リスト自体を増やす前提でこの例外を使い回さないこと。
- **onclick属性に特殊文字を渡さない**: テキストはグローバル配列に入れてインデックスだけ渡す（`onclick="mdSelect(0)"`）。`encodeURIComponent` 等を属性内に直書きするとパースエラー。
- **CSS specificity**: 画面表示は `#id.active { display:... }` のように `.active` を組み合わせる（IDセレクタ単体は `.screen { display:none }` に負けることがある）。
- 音声再生は `playMp3(src, text, r, cat)` / MATCHDAYは `mdPlaySrc(src)`。ファンファーレはWebAudio API（外部ライブラリ不使用）。
- **自分の声の聞き直しは全録音モード共通**: `keepRec(blob)` / `playMyVoice()` / `myVoiceBtn(sm)` の共通ヘルパーを使う（端末内Blob再生・APIコストゼロ）。**新しい録音フローを作ったら必ず onstop で `keepRec(blob)` を呼び、結果画面に `myVoiceBtn()` を置く**。個別のBlob管理を作らないこと。

---

## デプロイ

- `main` にpushするとVercelが自動デプロイ。確認は vercel.com。
- push前は必ず `npm run verify` を実行しOKを確認する。ROLEPLAY_SCENESを加工した場合は `roleplay-scene-edit` スキルの3視点レビューも通す。
