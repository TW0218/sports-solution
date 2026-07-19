---
name: app-test-drive
description: TOP BINSアプリのブラウザ検証で、ログインをバイパスして任意の画面・モード・状態へ1発でジャンプするための実証済みJSレシピ集。index.htmlのUI変更を検証するとき、特定のROLEPLAYシーン/Tier/MATCHDAY/ナッジ/オンボーディング画面を再現したいとき、「画面が出ない」「stateのセット方法が分からない」となる前に必ずこのスキルを読むこと。
---

# TOP BINS ブラウザ検証レシピ

`index.html`の変更をブラウザで検証する時の定型手順。ここのレシピは全て実機で動作確認済み。毎回コンソール操作を再発明しない。

## 起動とログインバイパス

1. `preview_start` を `{name: "sports-solution"}` で呼ぶ（`.claude/launch.json`定義済み、ポート8765）。
2. `javascript_tool` で以下を実行（Supabase認証を通さずアプリ本体を表示）:

```js
document.getElementById('scr-login').style.display='none';
document.getElementById('app').style.display='block';
entitled=true;
```

`S`はデフォルト値のまま動く。特定のS状態が必要なら直接代入する（`save()`は呼ばない — テスト状態を本物のSupabase行に書き込まないため。`S.xxx=値`だけで画面描画には十分）。

## 画面遷移の罠

- `go(id)`のidは**`scr-`プレフィックスを除いた名前**。`go('matchday')`が正しく、`go('scr-matchday')`は無反応（`scr-scr-matchday`を探しに行く）。
- 画面が真っ黒のときは `[...document.querySelectorAll('.screen.active')].map(e=>e.id)` でactive画面を確認。

## モード別ジャンプレシピ

### ROLEPLAY（シーン指定）
```js
rpDay=0; rpScenes=[ROLEPLAY_SCENES.find(s=>s.title==='壁を作れ')]; rpIdx=0;
go('rp-scene','push'); renderRPScene();
```
- Tierは`rpNextTier(scene)`=`rpMasteryLevel+1`で決まる。**Tier2(SILVER)以降を出したい場合**は先に `S.rpMastery[rpSceneKey(scene)]=1;`（=次はTier2）のように習熟度を仕込む。
- `renderRPScene()`は録音系フラグを自動リセットする（安全網）。

### MATCHDAY（シーン指定）
```js
mdQueue=[ROLEPLAY_SCENES.find(s=>s.title==='壁を作れ')]; mdQueueIdx=0;
go('matchday','push'); renderMdScene();
```
- 変数は`mdQueue`/`mdQueueIdx`（`mdScene`への直接代入では動かない）。
- ナッジ画面の再現: 上記の後 `mdShowNudge('got it');`
- 結果画面の再現: `mdShowResult('yes boss holding my position');`（AI採点APIを実際に叩く点に注意）

### オンボーディング（初回起動フロー）
```js
document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
S.name='Test'; S.position='fw';
showFirstRun();        // フレーズ試聴ステップ
frShowLevel();         // レベル自己申告ステップへ
```

### MAKE IT YOURS
```js
rpDay=0; rpScenes=rpDayScenes(0); miyStart();
```

## javascript_tool の罠

- **`const`は同一ページ内で再宣言エラーになる**（呼び出し間でスコープが残る）。2回目以降の実行では変数名を変えるか、`const`を使わず直接式で書く。
- 最後に評価した式が戻り値。オブジェクトを返すときは `JSON.stringify({...})` が確実。

## 検証の順序

1. `read_console_messages`（onlyErrors:true）— エラーゼロを先に確認
2. `computer` screenshot — 見た目の確認
3. スクショで判別しにくい場合は `document.getElementById(...).innerHTML.slice(0,500)` でDOMを直接読む
4. クリック検証は座標クリックが外れやすい — 外れたら対象の関数を`javascript_tool`で直接呼んで挙動を確認し、UIクリックは最後に1回だけ確かめる
5. レスポンシブ・スクロール検証は `resize_window` で縦幅を狭める（例: 375x550。ブラウザツールバー表示時の再現）

## 後始末

検証でSをいじった場合、リロード（`navigate`で同URL再訪）すれば実データから復元される。`save()`さえ呼ばなければ本番データは汚れない。
