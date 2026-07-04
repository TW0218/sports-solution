// api/配下の全プロキシで共有するガード（Origin検査 + 簡易レート制限）
// レート制限はサーバレス関数のウォームインスタンス内メモリのみで有効（再起動・スケールアウトでリセットされる）。
// 本格運用にはUpstash等の外部ストアが必要だが、鍵を盗まれた場合の被害を減らす簡易防波堤として設置。

const ALLOWED_ORIGINS = [
  "https://topbins.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const hits = new Map(); // ip -> {count, windowStart}
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  return ALLOWED_ORIGINS.some(o => origin === o || referer.startsWith(o));
}

function checkRateLimit(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

function guard(req, res) {
  if (!checkOrigin(req)) {
    res.status(403).json({ error: "Forbidden origin" });
    return false;
  }
  if (!checkRateLimit(req)) {
    res.status(429).json({ error: "Too many requests" });
    return false;
  }
  return true;
}

export { guard };
