// api/配下の全プロキシで共有するガード（Origin検査 + 簡易レート制限）
// レート制限はサーバレス関数のウォームインスタンス内メモリのみで有効（再起動・スケールアウトでリセットされる）。
// 本格運用にはUpstash等の外部ストアが必要だが、鍵を盗まれた場合の被害を減らす簡易防波堤として設置。

const FIXED_HOSTS = new Set(["topbins.vercel.app", "localhost"]);

const hits = new Map(); // ip -> {count, windowStart}
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

// 本番のカスタムドメイン(topbins.vercel.app)に加え、Vercelのデフォルトドメイン
// (sports-solution.vercel.app)とプレビューデプロイ(sports-solution-<hash>-*.vercel.app)も許可する。
// プレビューURLはデプロイごとに変わるためホスト名パターンで判定する。localhostはポート問わず許可（ローカル開発用）。
function isAllowedHost(hostname) {
  if (!hostname) return false;
  if (FIXED_HOSTS.has(hostname)) return true;
  return /^sports-solution(-[a-z0-9-]+)?\.vercel\.app$/.test(hostname);
}

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  try {
    if (origin && isAllowedHost(new URL(origin).hostname)) return true;
  } catch (e) {}
  try {
    if (referer && isAllowedHost(new URL(referer).hostname)) return true;
  } catch (e) {}
  return false;
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
