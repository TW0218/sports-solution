// Vercel Serverless Function: OpenAI Whisper (音声文字起こし) プロキシ
// クライアントの録音Blobをそのまま multipart/form-data で受け取り、OpenAIへ転送する。
// Vercelプロジェクトの環境変数に OPENAI_API_KEY を設定すること。
import { guard } from "./_guard.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!guard(req, res)) return;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": req.headers["content-type"],
      },
      body,
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
