---
name: player-onboarding
description: TOP BINSに新しい選手・ユーザーのアカウントを追加するときの一式手順（Supabaseアカウント作成の案内、無料entitlement付与SQL、PWAインストールマニュアルPDFの生成）。「〇〇さんを追加して」「アカウントを作って」「無料権限で追加」「インストールマニュアルを作って」と言われたら必ず使う。メール大文字小文字の罠など過去の実績ベースの落とし穴回避を含む。
---

# 選手アカウント追加の一式手順

新しいユーザー（選手・身内）をTOP BINSに追加する定型フロー。過去に木村さん・山﨑さんの追加で確立した手順。

## 1. アカウント作成（ユーザー本人の操作）

**Claudeはアカウント作成・パスワード入力を代行できない**（安全ルール上の制約。認証情報の入力は常に禁止）。以下の手順をユーザーに案内する:

1. Supabaseダッシュボード → Authentication → Users → 「Add user」→「Create new user」
2. メールアドレスとパスワードを入力、**「Auto Confirm User」をON**（確認メールを飛ばさない）
3. 作成できたらこの会話で「作成した」と教えてもらう

## 2. 無料entitlement付与（SQL EditorでSQL実行）

ユーザーにSupabase SQL Editorで以下を実行してもらう。**メールアドレスは必ず小文字に直して渡すこと** — Supabaseは保存時に自動で小文字化するため、大文字入りのメール（例: `Kenshin0625.fn@...`）をそのままwhere句に書くと**0行マッチで静かに空振りする**（実際に起きた事故）。

```sql
insert into entitlements (user_id, is_complimentary, note)
select id, true, '<誰か分かるメモ（例: 選手・山田太郎）>'
from auth.users where email = '<小文字のメールアドレス>'
on conflict (user_id) do update set is_complimentary = true;

-- 確認（1行返り、is_complimentary=trueであること）
select u.email, e.is_complimentary, e.note
from entitlements e join auth.users u on u.id = e.user_id
where u.email = '<小文字のメールアドレス>';
```

確認クエリが0行なら: `select email from auth.users where email ilike '%<メールの一部>%';` で実際の保存形を特定してやり直す。

※ entitlementはPWAでは参照されない（PWAは常時無料）。ネイティブApp版での課金免除フラグ。テーブル仕様は`supabase/entitlements.sql`。

## 3. インストールマニュアルPDF（1人1枚）

個人宛のPWAインストールマニュアルを作って渡す。実績のある構成:

1. **HTML作成**（scratchpadに`manual_<名前>.html`）: 内容は ①アプリURL（topbins.vercel.app）②本人のログインメール・パスワード ③ホーム画面に追加の手順（iPhone: Safariで開く→共有→ホーム画面に追加 / Android: Chrome→メニュー→ホーム画面に追加）④最初にやること（TRAINタブ→ROLEPLAY Day1）。480px幅前提のシンプルなCSS。
2. **PDF化はPlaywright**（weasyprintはこのMacでは動かない — Pango/GObjectのdlopen問題で修復不能だった実績あり）:

```js
// render_pdf.mjs — 実績のあるパターン
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 1200 } });
await page.setContent(fullHtml, { waitUntil: 'networkidle' });
const h = await page.evaluate(() => document.body.scrollHeight);
await page.pdf({ path: outPath, width: '480px', height: `${h}px`, printBackground: true });
await browser.close();
```

3. 完成PDFは`~/Desktop/`にコピーして渡す。

## 注意

- パスワードを含むマニュアルは**Artifactとして公開しない**（ローカルPDFのみ）。
- 複数人分は1人1ファイルで個別に作る（使い回しの1枚にしない — 認証情報が混ざるため）。
