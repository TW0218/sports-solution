#!/usr/bin/env node
// 各ティアの背景画像を生成するスクリプト
// 使い方: node scripts/generate_tier_images.js [tier]
// tier: nonleague | leaguetwo | leagueone | championship | premier | england

const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
if (!API_KEY) { console.error('OPENAI_API_KEY未設定'); process.exit(1); }

const TIERS = {
  sunday: {
    file: 'tier-sunday.png',
    prompt: `Cinematic photograph, ultra realistic, moody and dark atmosphere.
A young amateur male footballer seen from behind, standing on a rough, patchy Sunday League grass pitch
on a grey overcast afternoon in England. The pitch is worn and muddy with barely visible white lines.
No stands — just low metal railings and a handful of spectators on the sideline in coats.
The surroundings are a typical English park with bare trees. Dim, flat natural light, no floodlights.
The mood is gritty, humble, and raw. Muted desaturated color palette. Portrait orientation.`,
  },
  nonleague: {
    file: 'tier-nonleague.png',
    prompt: `Cinematic photograph, ultra realistic, warm hopeful mood.
A young male footballer in a plain kit seen from behind, walking onto a non-league grass pitch
at golden hour (late afternoon sunset). The pitch is modest but well-maintained with clear white lines.
A small covered terrace holds a few hundred supporters. No stadium lighting — natural golden light only.
The horizon glows amber. The mood is determined and hopeful. Shallow depth of field. Portrait orientation.`,
  },
  leaguetwo: {
    file: 'tier-leaguetwo.png',
    prompt: `Cinematic photograph, ultra realistic, dramatic tunnel shot.
A professional male footballer wearing a dark green jersey number 10, seen from behind,
walking through a narrow concrete stadium tunnel into a small EFL League Two stadium at night.
The pitch ahead glows bright green under modest floodlights. Around 3,000 fans visible in basic terrace stands.
The pitch is well-kept but the stadium is compact and functional. High contrast dark tunnel to bright pitch.
Teammates walk beside him. Portrait orientation.`,
  },
  leagueone: {
    file: 'tier-leagueone.png',
    prompt: `Cinematic photograph, ultra realistic, electric night atmosphere.
A professional male footballer seen from behind, arms raised, facing a roaring crowd
in a mid-sized English League One stadium at night under floodlights.
Around 8,000 to 10,000 passionate fans pack the stands — scarves waving, mouths open.
The pitch is in great condition, vivid green under strong floodlights.
Small stadium but intense and intimate atmosphere. Portrait orientation.`,
  },
  championship: {
    file: 'tier-championship.png',
    prompt: `Cinematic photograph, ultra realistic, high energy stadium atmosphere.
A professional male footballer seen from behind, standing on a Championship stadium pitch at night.
25,000 fans fill the three-tier stands under powerful modern floodlights.
The pitch is immaculate — lush green stripes, perfectly mowed. Confetti in the air.
The stadium is modern and large, creating an overwhelming wall of supporters.
Intense color contrast between deep green pitch and blazing white lights. Portrait orientation.`,
  },
  premier: {
    file: 'tier-premier.png',
    prompt: `Cinematic photograph, world-class production quality, ultra realistic.
A professional male footballer seen from behind, arms outstretched, facing a completely sold-out
modern Premier League stadium at night. 60,000 fans fill every seat — phones held up, roaring.
The pitch is the most perfect grass in the world — deep uniform green, immaculately striped.
Blinding LED floodlights, giant video screens glowing. The scale is overwhelming and awe-inspiring.
Shallow depth of field, cinematic hero-film grade. Portrait orientation.`,
  },
  japan: {
    file: 'tier-japan.png',
    prompt: `Cinematic photograph, ultra realistic, maximum scale and national pride.
A male footballer seen from behind, standing at the centre circle of a massive modern stadium at night.
He wears a deep navy blue Japan national football jersey — Samurai Blue —
with the Japan Football Association crest faintly visible near the back collar.
60,000 fans fill the stadium — Japanese flags and blue scarves waving everywhere.
Powerful LED floodlights blaze down on a perfect emerald green pitch.
The atmosphere is electric and historic. Portrait orientation, ultra wide lens, overwhelming scale.`,
  },
};

const target = process.argv[2];
if (!target || !TIERS[target]) {
  console.log('使い方: node scripts/generate_tier_images.js <tier>');
  console.log('tier:', Object.keys(TIERS).join(' | '));
  process.exit(1);
}

const { file, prompt } = TIERS[target];
const outDir = path.join(__dirname, '..', 'images');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const outPath = path.join(outDir, file);

console.log(`🎨 ${target} の画像を生成中... (30〜60秒)`);

const body = JSON.stringify({
  model: 'gpt-image-1',
  prompt: prompt.trim(),
  n: 1,
  size: '1024x1536',
  quality: 'high',
  output_format: 'png',
});

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
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`✅ 保存: ${outPath}`);
  });
});

req.on('error', e => { console.error('Error:', e); process.exit(1); });
req.write(body);
req.end();
