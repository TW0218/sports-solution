---
name: ship
description: TOP BINSの変更をcommit・pushして本番デプロイする前の定型チェックリスト。ユーザーが「commit」「push」「デプロイして」「リリースして」と言ったとき、または機能実装が完了して出荷段階に入ったときに必ず使う。verify・ドキュメント追記判断・コミットメッセージ形式・許可確認を一式でこなす。
---

# 出荷前チェックリスト

`main`へのpush = 即本番デプロイ（Vercel自動）。以下を上から順に。

## 1. 検証

- `npm run verify` が合格していること（構文＋絵文字＋音声整合性＋manifest再生成）。
- `ROLEPLAY_SCENES`を加工した場合は`roleplay-scene-edit`スキルの3視点レビューも通過していること。
- UIに見える変更なら、ブラウザでの動作確認（`app-test-drive`スキル）を済ませていること。

## 2. ドキュメント追記の判断

- **設計判断・経緯・事故の詳細** → `docs/design-log.md`へ追記（日付つき）。機能を実装したら基本こちら。
- **今後の作業で守る新ルールが生まれた場合だけ** → `CLAUDE.md`へ数行で追記。迷ったらdesign-logのみ。CLAUDE.mdを肥大させない（44KB肥大の反省が再編の理由）。
- `sw.js`のシェル挙動を変えた場合はキャッシュ名（`topbins-shell-v1`等）のバージョンを上げたか確認。

## 3. コミット

- `git status`と`git diff --stat`で意図しないファイルが混ざっていないか確認（特に`audio/*.mp3`の追加漏れ・`audio-manifest.json`の再生成分は含める）。
- メッセージ形式（このリポジトリの慣習）:
  - 1行目: `feat:`/`fix:`/`docs:`/`chore:` + 日本語の要約
  - 本文: 何を・なぜ（ユーザー指摘や10人レビューが起点ならそれも1行）
  - 末尾: `Co-Authored-By: Claude <モデル名> <noreply@anthropic.com>`

## 4. 許可と実行

- **commit・pushはユーザーの明示的な指示があってから**。実装完了時は「commit・pushしてよろしいですか？」と確認して待つ（このプロジェクトの合意済み運用）。
- push後はVercelが自動デプロイ。特別な後処理は不要。デプロイ結果の確認が必要ならvercel.comへ。
