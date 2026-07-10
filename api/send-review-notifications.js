// Vercel Cron（1日1回、vercel.json参照）から呼ばれる。
// S.mdReviewQueue の due が今日以前になっているユーザーに、復習を促すプッシュ通知を送る。
// Vercelプロジェクトの環境変数に SUPABASE_SERVICE_ROLE_KEY / VAPID_PRIVATE_KEY / CRON_SECRET を設定すること。
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gsfqozfambpaufijhktf.supabase.co";
const VAPID_PUBLIC_KEY = "BEZRD7opJlfHMj-FJ03VWIN95My6CtkGAw1q8QVJrgQ1pOfYWlaumLge8wmMXsRAm1iL1kaX0U37nrFQAI2M0n4";

webpush.setVapidDetails(
  "https://topbins.vercel.app",
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Vercel Cronは呼び出し時に Authorization: Bearer $CRON_SECRET を自動付与する
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { data: users, error } = await supabase.from("user_progress").select("user_id, progress");
    if (error) throw error;

    const dueUserIds = (users || [])
      .filter(u => {
        const queue = u.progress?.mdReviewQueue || [];
        return queue.some(item => item.due <= today);
      })
      .map(u => u.user_id);

    if (dueUserIds.length === 0) {
      return res.status(200).json({ dueUsers: 0, sent: 0, failed: 0 });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", dueUserIds);

    let sent = 0, failed = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "TOP BINS",
            body: "苦手だったシーン、復習の時間だ。",
            url: "/",
          })
        );
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          // 購読が失効している（アンインストール・許可取り消し等）ので掃除する
          await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
        }
      }
    }

    return res.status(200).json({ dueUsers: dueUserIds.length, sent, failed });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
