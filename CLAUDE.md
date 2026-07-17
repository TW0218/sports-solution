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
- **`entitled`を実際に消費する2機能（摩擦除去型プレミアム、Ek指摘への対応）**: MATCH TICKET無制限（`openMatchday()`が`entitled`ならチケット残数チェック・減算をスキップ、`renderMatch()`のバッジは`∞`表示）と、音声一括DL（GROW画面の「音声を全部保存」カード、`bulkDownloadAudio()`）。**PWAはentitled常時trueのため、この2機能は現状PWAでも常に無料で使える**（設計上合意済み。ネイティブ版でIAP/ペイウォールを実装した時点で初めて課金/複製グラントの分岐として機能する）。
- **`audio-manifest.json`**: `bulkDownloadAudio()`が参照する音声ファイル一覧。`textToAudioSrc()`のようなテキスト→ファイル名変換ロジックを複製せず、`scripts/generate_audio_manifest.js`が`audio/`ディレクトリの実ファイルから機械生成する（`npm run verify`のたびに再生成されるため常に実態と一致し、同期ズレが構造的に起きない）。ダウンロードは`Promise.all`＋固定並列数のワーカーで`audio/`を1件ずつ`fetch()`するだけ（Service Workerの`cache-first`が自動的に`topbins-runtime-v1`へ保存する）。**ファイル名は必ず`encodeURIComponent()`してから`fetch()`すること**（`%`や`\`を含む既存ファイル名が生の文字列だと400エラーになる実績あり）。
- **`entitled`で無料/Proを分ける残り3機能（2026-07-12、コスト試算の上で決定）**: 実際にAPIコストを消費する箇所（`api/coach.js`, `api/score.js`, `api/transcribe.js`）を洗い出した結果、MATCHDAY/ROLEPLAY Tier1(BRONZE)/ミッション類は1人1日あたり合計でも$0.01未満とごく軽微だが、`askAI()`（PITCH VOCABのAIコーチ、claude-sonnet系max1000トークン）は1回$0.005前後と突出して高く、かつ`api/*.js`は`_guard.js`のOrigin検査＋IPレート制限だけでユーザー単位の上限が一切ないことが判明した。これを踏まえ以下をentitled前提のキャップに変更した:
  - **MATCH_TICKET_MAX = 1**（旧3）。`openMatchday()`は`entitled`ならチェック・減算自体をスキップするので、この定数は非entitledのみに効く。
  - **Mastery Rank Tier2以上（SILVER/GOLD/TOP BINS）は非entitledなら生涯1回だけ体験可**。`S.rpTrialUsed`（初期値false）で管理。`renderRPScene()`が`tier>=2 && !entitled && S.rpTrialUsed`なら`renderRPLocked()`（ロック画面、`rp-scene`内）を出して自由回答フローに入らせない。トライアル消費は`showRPResult()`のTier2以上分岐の先頭で`if(!entitled)S.rpTrialUsed=true`（合否問わず「挑戦した時点」で消費）。**Tier1(BRONZE)の日課は対象外、常に無料のまま**。
  - **AIコーチ（`askAI()`）は非entitledなら1日`AI_COACH_FREE_DAILY_MAX`（=3）回まで**。`S.coachCallDate`/`S.coachCallCount`で日次カウント（日付が変わったら自動リセット）。上限到達時はAPIを叩かず案内メッセージのみ表示（コスト発生ゼロ）。
  - **Weak Foot Mission（`startWeakFootMission()`）はentitled専用**。非entitledがタップすると`toast()`で案内するのみで、通常の失敗駆動復習（`mdReviewQueue`の期限到来時にMATCHDAYへ出題）はentitledに関係なく従来通り機能する。
  - **これらは全てクライアント側の分岐でしかない**（`api/*.js`はユーザーIDを見ておらず、devtoolsから直接叩けば無料ユーザーでも上限を回避できる）。ユーザー単位のサーバ側フェアユース（`api_usage`テーブル等でSupabase認証つきクォータを取る）は意図的に未実装のまま。実装はIAP本体（Capacitorラップ後）と同時にやる計画。

---

## 行動計測（自前実装・外部SaaS不使用）

外部アナリティクスSaaSは使わず、Supabaseの`events`テーブルに一本化している（プライバシーポリシー未整備の段階で新しい第三者にデータを渡さないため。詳細な議論の経緯はプロジェクトの会話履歴を参照）。

- **`track(name, props)`**: 汎用イベント記録。`events`テーブルはRLSで**insertのみ許可**（selectポリシーは意図的に作らない）。分析はSupabaseダッシュボードのSQL Editorから`supabase/analytics_queries.sql`のクエリで行う。テーブル定義は`supabase/events.sql`。
- **必ずfire-and-forget**: `track()`はエラーを握りつぶす。計測の失敗が絶対にユーザー体験を壊してはいけない。新しいイベントを足すときもこの原則を破らないこと。
- **計測イベント一覧**: `app_open`（ログイン成功時・セッション復元時）/ `day_complete`（ROLEPLAY Day完了、`day`と`avg_score`）/ `matchday_played`（`score`,`verdict`,`is_review`）/ `mission_complete`（`mission`: pitch_quiz/locker_quiz/cards/shadowing）/ `make_it_yours_complete`・`make_it_yours_skip` / `streak_broken`（`previous_streak`。ストリークが実際に途切れた時のみ、0→1のような初回は含めない）/ `scene_mastery_up`（`key`,`tier`,`hint`。Mastery Rankの昇格。`hint`はその挑戦でヒントを開いたか）/ `season1_complete`（`avg`。Day25完了のたび、初回・周回問わず発火）/ `weak_foot_mission_start`（`cat`,`pending`）/ `audio_bulk_download_start`・`audio_bulk_download_complete`（`count`,`failed`）/ `hint_used`（`key`,`tier`。ROLEPLAY Tier2ヒントを開いた瞬間のみ、閉じる/再度開くでは重複記録しない）。
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

- **ROLEPLAY = キャリアモード**: 7カテゴリ×25シーンを「Day 1〜25」で横断提示。各Dayは各カテゴリのindex Nを1つずつ集めた7シーン。**カテゴリ配列の並び順がそのままキャリア時系列**（media/agentは初期→終盤に並び替え済み）なので、シーンを追加・並び替えるときは位置がDayを意味することを忘れない。前Day完了で次Dayが解放（`rpDayUnlocked`）。進捗は `S.rpCompletedSceneKeys` から導出し、専用フィールドは持たない。**Day解放は完了ベースのみで日付ゲートはない**（一気に25日分進める設計。UI文言でそう見せかけない — 過去に「また明日解放される」という実態と違う表示をしていた事故がある）。
- **MASTERY RANK（Day25で終わらせない設計）**: 新規シーン・新規音声を追加せず、既存175シーンを難易度違いで繰り返し使わせる仕組み。`S.rpMastery`（`{sceneKey: 0〜4}`、単語カードの`S.box`パターンを流用）でシーンごとの習熟度を管理。Tier1=BRONZE（3択・既存フロー）→Tier2=SILVER（自由回答＋ヒント）→Tier3=GOLD（自由回答・ヒントなし）→Tier4=TOP BINS（同+スピードボーナス）。`rpNextTier(scene)`が次に挑戦すべきTierを返し、`renderRPScene()`がTier1なら`renderRPChoose()`、Tier2以上なら`renderRPFreeResponse()`（自由回答→MATCHDAYと同じ`mdAiScore()`で採点）に分岐する。**合格点(50)以上かつ現在の習熟度を上回るTierでのみ昇格。失敗しても習熟度は下がらない（優しめルール、単語カードの「間違えたら0に戻る」とは意図的に変えている）**。Dayグリッドには完了Dayの最低Tierをバッジ表示（`rpDayMasteryTier`）。既存の`rpDayCompleted`/`rpDayUnlocked`（Day解放条件）はTier1基準のまま変更していない。
  - **Tier2ヒントはタップ開閉式（2026-07-12、SLA専門家視点レビュー対応）**: 元々`scene.hint`（日本語の指示文）を常時表示していたが、「ヒントを見たかどうか判定できない＝Mastery Rankの真の定着判定に使えない」という指摘を受け、MATCHDAYの`mdToggleHint()`と同じ`.md-hint-btn`/`.md-hint-box`パターンに統一（`rpToggleHint()`）。初めて展開した瞬間だけ`hint_used`イベントを記録（開閉を繰り返しても重複記録しない、`_rpHintUsed`で1シーン1回に制限）。単語レベルのヒントは`hintWord`/`hintWordJa`として175シーン全件に追加済み（2026-07-14、`roleplay-scene-edit`スキルの3視点＋独立エージェント検証を通過）。**選定基準: `keys`（お手本回答）に実際に登場する現場語・感情語を1つ**（唯一の例外はdaily「賃貸の問い合わせ」のviewing＝NPC側の語を意図的に採用）。**キー名を`en:`にしない理由はMIYチップと同じ**（`validate_audio.js`の誤検知回避）。
  - **hintWordの表示は段階的な足場かけ（SLA視点）**: Tier2=指示文（`hint`）＋単語チップ＋日本語用例、Tier3=単語チップのみ、Tier4=支援なし（`renderRPFreeResponse()`の`hintInner`分岐）。ランクが上がるほどヒントを弱める設計。MATCHDAYのHINTボタンとナッジ（`mdShowNudge()`）も人手選定の`hintWord`を最優先で表示し、無いシーンだけ`mdKeyVocab()`の機械抽出にフォールバックする。
  - **ヒント使用は昇格をブロックしない（2026-07-14、8人視点レビューで決定）**: Tier階段自体が足場の漸減装置（SILVER=指示文+単語→GOLD=単語のみ→TOP BINS=支援なし）なので、独立した習熟はTOP BINSまで登れば構造的に検証される。ヒント使用に罰を与えるとユーザーが「昇格を守るためにヒントを見ない」ようになり学習も計測も壊れる、という判断。代わりに①`scene_mastery_up`イベントに`hint`フラグを載せて将来のルール再検討をデータで裏取りできるようにし、②ヒントが存在するTier2/3でヒント未使用のまま昇格した時だけ「NO HINT — 自力で決めた」の名誉表示を昇格演出に添える（Tier4はヒント自体が無いので表示しない）。**ルールを厳格化する場合は必ず`hint`フラグ付き昇格データのベースレートを見てから**（Tier2挑戦の大半がヒント使用なら、ゲート化はほぼ全員の昇格を止めることになる）。
  - **スピード判定は語数で可変**（`rpSpeedThresholds(text)`）: 175シーンのkeysは3語〜9語まで幅があり、固定秒数だと短いフレーズに緩すぎ・長いフレーズに厳しすぎるため。`基礎1.2秒+1語につき0.35秒`でAランク（フルボーナス）閾値を算出し、そこから+2秒でBランク（部分ボーナス）閾値とする。**SILVER/GOLDはスコアのみで昇格可（優しめ）だが、TOP BINS（Tier4）だけはスコア合格(50点以上)に加えてAランク相当のスピードも必須ゲート**（`meetsSpeedGate`）。スコアが高くても遅ければ昇格せず「正確だった、あとはスピードだけ」と表示される。失敗しても習熟度は下がらない優しめルールとは独立（昇格しないだけで降格はしない）。
  - **「25」の意味づけ**: `CAREER_DAY_COUNT=25`は本来175シーン÷7カテゴリの割り算の結果でしかなく、それ自体に節目としての意味はない（2026-07-12にユーザーから「25は中途半端では」と指摘され検討）。30/31（1ヶ月）への変更は検討したが、①`rpDayUnlocked`に日付ゲートがなく一気に25日分進められる設計上「1ヶ月間毎日続けた」という実体が伴わない、②175=7×25はきれいに割り切れるため30にするには新規シーン追加（Season1〜4量産を却下した過去の判断と矛盾）か、毎日7カテゴリ全部に触れる今の一貫した配分を崩すかのどちらかが必要、という理由で見送り。代わりに**プレミアリーグのトップチームスカッド登録枠が25人**という実在のサッカー文化に「25」を紐付けるコピー変更のみ実施（新規シーン0、既存の日数・配分は一切変更なし）。「Day 1から、キャリアを進めろ。目指すは、トップチーム25人のスカッド入り。」（`renderRoleplayMenu()`）と「25人のトップチームスカッドに、入った。」（`renderSeasonComplete()`）の2箇所。
  - **Day25完了 = 「SEASON 1 COMPLETE」ハブ画面**（`renderSeasonComplete()`、`renderRPDayComplete()`が`rpDay===CAREER_DAY_COUNT-1`の時だけ分岐）。「ゴール」ではなく「まだ続く」ことを伝えるため、通常Dayの「DAYn COMPLETE」単発ボタンとは別に、3つのCTA（弱点を潰す＝`startWeakFootMission()`／次のSeasonへ＝Mastery Rankの日一覧に戻る／実戦MATCHDAY＝`openMatchday()`）を並べる。弱点データ（`weakestCategory()`）が無いユーザーには「弱点を潰す」ボタン自体を出さず2択にする。**初回完了だけでなく、Day25を再訪（Mastery Rank周回）するたび毎回このハブ画面が出る**（Season1クリア後の定常ハブとして機能させる設計、一度きりの祝福画面にしない）。
  - **NPCセリフの日本語訳を常時表示（`lineJa`、2026-07-15）**: 中学2年生レベルの学習者ペルソナを含む10人視点分析で、初級者はNPCの英語命令文（175件中46%が疑問文ではなく命令・宣言文）自体を読めず、そもそも何を返せばいいか分からないまま離脱するリスクが最有力と判定。既存の`hint`（返答方針の日本語ヒント）とは別物で、`hint`は「どう答えるか」、`lineJa`は「NPCが何を言っているか」を示す。ROLEPLAY_SCENES全175件に`npc`直後のフィールドとして追加（`roleplay-scene-edit`スキルの3視点＋独立エージェント検証を通過）。表示は`.rp-npc-bubble`内・`scene.line`の直下に常時表示（タップ開閉にしない — hintとは違い「セリフの意味」は毎回必要な情報でヒントではないため）。`renderRPChoose()`・`renderRPFreeResponse()`・MATCHDAY`renderMdScene()`の3箇所すべてに配線。10人視点で出た残り2案（英国サッカー俗語のタップ開閉グロッサリー、MATCHDAY自由回答の初回露出タイミング調整）は未着手。
- **MATCHDAY**: 1日1問・MATCH TICKET制（無料は`MD_TICKET_MAX`=1枚、entitledは無制限）。**失敗駆動復習**: AI採点<50で `S.mdReviewQueue` に登録（初回失敗→翌日、再失敗→3日後）、≥50で卒業。`shuffleMd()` は復習期限が来たシーンを最優先で出題。シーンのキーは `${cat}||${title}` 形式で統一。
  - **弱点レポート＋Weak Foot Missions**: 新規データを持たず、既存の`S.mdReviewQueue`をRP_CATEGORIESのカテゴリ別に集計するだけで実現（`weakCategoryStats()`/`weakestCategory()`）。ホーム画面の弱点カードと`startWeakFootMission()`が同じ集計関数を参照する（同じ弱点判定を2箇所で使い回す設計）。Weak Foot Missionは`mdWeakMode`フラグでMATCHDAYの1問フローを流用しつつ、**MATCH TICKETを消費せず・期限日を待たず**に弱点カテゴリの復習待ちシーンをランダムに1問出題する。採点結果は通常のMATCHDAYと同じ`mdReviewQueue`更新ロジック（卒業/延長）にそのまま乗る。**`startWeakFootMission()`自体はentitled専用**（非entitledはtoast案内のみ）。通常の失敗駆動復習（期限到来時のMATCHDAY自動出題）はentitledに関係なく機能する。
  - **「相槌だけで通せてしまう」問題への対応（2026-07-12）**: ROLEPLAY_SCENES 175件中80件（46%）は`line`が疑問文ではなく命令・宣言文で（例:「Wall! Five man wall! Hold your position!」）、AI採点（`mdAiScore`）は「意図が伝わっているか」しか見ないため"OK, got it."のような最小努力の返答でも合格しやすい。8人視点レビューで4案（Chou=コンボ、Ek=ラリー拡張、Eyal=語彙の可視化、von Ahn=事前ナッジ）が出て、コンボ・ナッジ・語彙可視化の3つを共通の語彙判定エンジンに統合して採用した（ラリー拡張はPro機能として別途検討）。
    - **語彙判定エンジン（`mdKeyVocab(keys)`）**: `scene.keys`（お手本回答）からストップワードを除いた内容語を最大4つ抽出するローカル関数。API不使用。ナッジ・結果画面の語彙チップ・VOCAB COMBOの3箇所がこの同じ抽出結果を参照する（同じ判定を使い回す設計、[[project_topbins_overview]]の他機能と同じパターン）。
    - **ナッジ（`mdIsShallow()`→`mdShowNudge()`）**: 録音停止後、AI採点を呼ぶ**前**に、抽出した語彙を一切含まない5語以下の短い返答を検出したら「通じてる。でも、もう一言足せる？」を1回だけ挟む。`scene.hint`（日本語、既存の必須フィールド）と語彙チップ2つを見せ、[もう一言足す]（再録音）／[これで勝負]（そのまま採点へ）を選べる。1シーン1回のみ（`_mdNudged`フラグ、`renderMdScene()`でリセット）。ローカル判定のみなのでAPI費用は増えない。
    - **語彙チップ（結果画面）**: 抽出した語彙を、実際に使えた語（緑）・使えなかった語（グレー）で色分け表示。採点ロジックは変えず、「浅い返答は見抜かれている」ことを視覚的に伝える。
    - **VOCAB COMBO（`S.mdCombo`）**: 合格（50点以上）かつ鍵語彙を1つ以上使えたらコンボ+1。**相槌だけの合格（語彙0）はコンボを切らないが伸ばさない**、不合格でリセット。5・10到達時にtoastで一言祝う。チケットやスコアには絡めない（名誉表示のみ、課金設計と干渉させない）。
- **ミッション**: 1日4ミッション（フレーズ・クイズ・シャドーイング・単語カード）。全完了で `checkMissionBonus()` がTICKET+1。
- **MAKE IT YOURS（Dayの締め）**: サブ理念「自分事に置き換えて覚える」（自己関連付け効果＋生成効果）の実装。3段階フロー: Step1（`renderMIY()`）で日本語の質問＋「今日の型」（穴埋め1箇所、`MIY_FRAMES`にカテゴリごとの`{q,frame,frameJa,chips}`を用意）に、ヒントチップをタップ or 自分の言葉（日本語可）で回答→変換ステップ（`miyBuildSentence()`）でAIが型に沿った完成英文に変換（`miyGrammarCheck()`、`/api/score`経由）→Step2（`renderMIYSpeak()`）で完成文を読み上げて`S.myPhrases`に既存形式`{c,en,ja,ex,exJa,note}`で保存（単語カードの「マイフレーズ」デッキに自動還流）。聞き直しは録音Blob（コストゼロ）＋ブラウザTTSお手本。スキップ可・強制しない。
  - **2026-07-12に「今日のフレーズを借りる」設計から「質問に答えて型の穴を埋める」設計へ全面刷新**（ユーザーからの複数回のフィードバックを受けて）。経緯: ①自由生成のハードルが高すぎる→例文を追加 → ②例文とベースフレーズが同居して「どっちを真似すればいいの」と混乱 → ③日本語質問＋穴埋め1箇所＋ヒントチップに再設計、という段階を踏んだ。旧`MIY_EXAMPLES`・旧`miyCheck()`/`miyShowResult()`（発話後にAI採点する設計）は全て廃止済み。
  - **ヒントチップの語彙とAI変換結果を一致させること**: ヒントで「逆足の練習」→"training my weak foot"と見せたのに、AIの変換結果が別の言い回し（"working on my left-foot touch"等）になると再び混乱を招く。`miyGrammarCheck()`のプロンプトに`frame`と`chips`の対応表を渡し、「ユーザーの回答がチップに近ければチップの英語表現をそのまま使うこと」を明示指示している。チップのキー名は`eng:`（`en:`ではない）— `validate_audio.js`が`en:`を全ファイル横断でスキャンして音声必須と判定するため、音声を持たないチップに`en:`を使うと`npm run verify`が誤検知する（旧`sample:`と同じ理由、キー名は機能ごとに変わるので都度注意）。
  - **文法チェックは「採点」ではなく「変換」**: 旧設計は発話後にAIが合否判定していたが、新設計では発話前の変換ステップで既に完成文が確定するため、発話後の再チェックは行わない（`miyToggleRec()`のonstopは`keepRec()`で自分の声を保存するだけ）。
  - **スキップしても書いた文は無駄にしない**: `miySkip()`は変換済み（`_miyConverted`）ならAPIを再呼び出しせずそのまま保存、まだ下書き段階なら`saveDraftPhrase()`で変換してから保存する（`note`に「（下書き）」を付けて完走分と区別）。発話まで到達しなくても作文の努力は失われない。

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
- **正解/不正解の基本フィードバックは必ず`sfx('good'|'bad')`を呼ぶこと**: `sfx()`は音（WebAudio）と振動（`navigator.vibrate`、iOS Safariは非対応なのでAndroidのみ実際に振動する）を1箇所にまとめている。新しい採点結果画面を作ったら、スコア確定直後に必ず`sfx(passed?'good':'bad')`を呼ぶ。**過去にドリル・ROLEPLAY・MATCHDAY・MAKE IT YOURSの4モードでこの呼び出しが抜けていた事故がある**（2026-07-12発見・修正）— 高得点だけの派手な演出（`showCelebration()`/`mdCelebrate()`）を後から追加した際、基本フィードバック音を引き継ぎ忘れたのが原因。派手な演出は基本フィードバックの代わりにならない（両方鳴らす）。
- **自分の声の聞き直しは全録音モード共通**: `keepRec(blob)` / `playMyVoice()` / `myVoiceBtn(sm)` の共通ヘルパーを使う（端末内Blob再生・APIコストゼロ）。**新しい録音フローを作ったら必ず onstop で `keepRec(blob)` を呼び、結果画面に `myVoiceBtn()` を置く**。個別のBlob管理を作らないこと。
- **録音停止処理は「MediaRecorderが既にinactive」なケースを必ず分岐すること**: `_stopDrillRec()`/`stopRPRec()`/`mdStopRec()`はどれも同じ構造のバグを持っていた（2026-07-12発見・修正）。「processing中」フラグを立ててから`state!=='inactive'`の時だけ`stop()`を呼び、`onstop`ハンドラの中でだけフラグを戻す設計だったため、**iOSの音声再生とマイクのオーディオセッション切替やネットワーク不調でMediaRecorderが呼び出し前に自然停止していると、`stop()`がスキップされ`onstop`が永久に発火せず、フラグが立ちっぱなしで操作不能になる**（「4回目のリトライでマイクがタップできなくなった」という実際の不具合として発現）。修正パターン: `state==='inactive'`ならフラグを立てず、その場で失敗扱いの結果表示に直接分岐する（`showDrillResult('',...)`/`showRPResult('',...)`/`mdShowResult('')`）。新しい録音フローを作る時もこの分岐を必ず入れる。あわせて`renderDrillPhrase()`/`showDrillSpeak()`/`renderRPScene()`の描画開始時に録音系フラグをリセットする安全網も入れている（`renderMdScene()`は既存）。
- **`_transcribeAudio()`（Whisper呼び出し）には20秒のAbortController タイムアウトがある**: 元々`fetch`にタイムアウトがなく、通信不調時に無期限にハングして呼び出し元の「認識中...」ロックが解除されない事故があった。ROLEPLAY/MATCHDAY/ドリル/MAKE IT YOURS全モードがこの共通関数を使うため、ここを直せば全モードに効く。
- **オンボーディングは文脈型の一言ヒントのみ、大きなチュートリアル画面は作らない**: 8人視点レビューでZhuo（UI/UX）が「2ステップの初回体験は速くて良いが、TRAIN/MATCH/GROWの3タブやROLEPLAY・MATCHDAYがどう繋がっているか初見では分かりにくい」と指摘したことへの対応（2026-07-12）。`hintBanner(id,text)`/`dismissHint(id)`がTRAIN・MATCH・GROW各タブの初回描画時にだけ1行バナーを出し、`S.seenHints`に記録して二度と出さない。既存の高速な2ステップオンボーディング（`showFirstRun()`）を崩さないよう、説明を前置きせず各画面に到達した瞬間だけ出す設計にした。新しいタブ/主要画面を追加する時はこのパターンを踏襲する。

---

## デプロイ

- `main` にpushするとVercelが自動デプロイ。確認は vercel.com。
- push前は必ず `npm run verify` を実行しOKを確認する。ROLEPLAY_SCENESを加工した場合は `roleplay-scene-edit` スキルの3視点レビューも通す。
