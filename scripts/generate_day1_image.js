#!/usr/bin/env node
// DALL-E 3でDAY1カード用の背景画像を生成するスクリプト
// 使い方: node scripts/generate_day1_image.js

const https = require('https');
const fs = require('fs');
const path = require('path');

// .envファイルから読み込む（存在する場合）
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
if (!API_KEY) {
  console.error('Error: OPENAI_API_KEYが設定されていません');
  console.error('実行方法: OPENAI_API_KEY=sk-... node scripts/generate_day1_image.js');
  process.exit(1);
}

const PROMPT = `
Cinematic wide-angle photograph, realistic.
A professional male footballer seen from behind, wearing a white and dark green jersey with number 10,
standing at the touchline of a football pitch at night,
about to step onto the bright green grass under powerful stadium floodlights.
Four diverse teammates — two white and two Black players — are visible on the pitch in the distance,
waiting and looking back.
The white touchline is clearly visible at the player's feet as a threshold.
The pitch glows vibrantly green under the lights.
Stadium atmosphere, slight lens flare from floodlights.
Ultra realistic, cinematic color grading, shallow depth of field.
Aspect ratio 3:2, portrait orientation slightly cropped.
`.trim();

const body = JSON.stringify({
  model: 'gpt-image-1',
  prompt: PROMPT,
  n: 1,
  size: '1024x1536',
  quality: 'high',
  output_format: 'png',
});

console.log('🎨 DALL-E 3 で画像を生成中... (30〜60秒かかります)');

const req = https.request({
  hostname: 'api.openai.com',
  path: '/v1/images/generations',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`Error HTTP ${res.statusCode}:`, data);
      process.exit(1);
    }
    const json = JSON.parse(data);
    const b64 = json.data[0].b64_json;
    const outDir = path.join(__dirname, '..', 'images');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
    const outPath = path.join(outDir, 'day1-pitch.png');
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`✅ 画像を保存しました: ${outPath}`);
    console.log('次のステップ: index.html のday1カードにこの画像を組み込みます');
  });
});

req.on('error', e => { console.error('Request error:', e); process.exit(1); });
req.write(body);
req.end();
