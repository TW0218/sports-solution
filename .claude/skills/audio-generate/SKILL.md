---
name: audio-generate
description: TOP BINSの音声（ElevenLabs TTS）を生成する定型パイプライン。新しいフレーズ・シーン・例文を追加して音声mp3が必要になったとき、npm run verifyが「mp3が存在しない」エラーを出したとき、必ずこのスキルの手順で生成する。APIキーの場所・dry-run・タイムアウト対策・検証まで一式。
---

# ElevenLabs 音声生成パイプライン

新しい英語テキストに音声を付ける時の定型手順。ボイス設定（Eastend Steve / eleven_multilingual_v2 / stability=1.0等）は`scripts/elevenlabs_generate.js`にハードコード済みで変更不要。

## 手順

### 1. フレーズを登録
`scripts/phrases_to_record.txt` に1行1フレーズで**追記**する（既存行は消さない — 生成済みファイルはスキップされるので残っていて害がない）。

### 2. APIキーの読み込みとdry-run
キーはリポジトリ直下の`.env`にある（`ELEVEN_API_KEY`）。まずdry-runで対象件数とファイル名を確認する:

```bash
cd <repo> && set -a && source .env && set +a && \
ELEVEN_API_KEY="$ELEVEN_API_KEY" node scripts/elevenlabs_generate.js --dry-run
```

- 「Need generation」の件数が想定と一致するか確認。多すぎる場合はtxtの重複や既存mp3の欠落を疑う。
- 出力されるファイル名が`index.html`側の期待（ROLEPLAYなら`audio`/`keyAudio`フィールド、カード系なら`textToAudioSrc()`変換）と一致するか数件目視。

### 3. 本実行（タイムアウト対策必須）
1件あたり約1〜1.5秒（API＋350msレート制限）。**Bashのデフォルトタイムアウト2分では約80件で切れる**ので、対象件数に応じて:

- 〜80件: そのまま実行
- 80件超: `timeout: 600000`（10分）を指定して実行

```bash
cd <repo> && set -a && source .env && set +a && \
ELEVEN_API_KEY="$ELEVEN_API_KEY" node scripts/elevenlabs_generate.js
```

**途中でタイムアウトしても安全**: 生成済みファイルは自動スキップされるので、同じコマンドを再実行すれば続きから再開する。`--force`は既存ファイルも再生成するので通常使わない。

### 4. 検証
```bash
npm run verify
```
音声整合性チェック＋`audio-manifest.json`再生成（音声一括DL機能が参照）まで一括で走る。「mp3が存在しない」が残っていたら、テキストの表記（記号・ハイフン・アポストロフィ）とファイル名変換ルールの不一致を疑う — `—`(emダッシュ)や`–`は除去されるが、通常ハイフン`-`は**残る**。

## 落とし穴

- ファイル名変換は`textToAudioSrc()`（index.html）と`toFilename()`（生成スクリプト）の2箇所同期。**片方だけ変えない**。
- `en:`というキー名は`validate_audio.js`が「音声必須」と判定する。音声を持たないフィールドに`en:`を使わない。
- 生成したmp3はgit管理対象。commit時に`audio/*.mp3`の追加を含めること。
