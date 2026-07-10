// Vercel Cron（1日1回、vercel.json参照）から呼ばれる。
// S.mdReviewQueue の due が今日以前になっているユーザーに、復習を促すプッシュ通知を送る。
// Vercelプロジェクトの環境変数に SUPABASE_SERVICE_ROLE_KEY / VAPID_PRIVATE_KEY / CRON_SECRET を設定すること。
//
// 通知文言はパーソナライズする（シーン名・件数・失敗回数を実データから使う）。
// 加えて「言い回し」だけを2バリアントでA/Bテストする（experimentVariant()と同じ
// 決定論的ハッシュをサーバ側に再実装。同一ユーザーは常に同じバリアントになる）。
// クリック率の分析はsupabase/analytics_queries.sqlのテンプレートを参照。
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gsfqozfambpaufijhktf.supabase.co";
const VAPID_PUBLIC_KEY = "BEZRD7opJlfHMj-FJ03VWIN95My6CtkGAw1q8QVJrgQ1pOfYWlaumLge8wmMXsRAm1iL1kaX0U37nrFQAI2M0n4";
const NOTIF_EXPERIMENT = "review_notif_copy_v1";

webpush.setVapidDetails(
  "https://topbins.vercel.app",
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// index.htmlのexperimentVariant()と同一アルゴリズム。同じユーザーは常に同じバリアントになる。
function pickVariant(userId, experimentName, variants) {
  let hash = 0;
  const str = userId + ":" + experimentName;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return variants[Math.abs(hash) % variants.length];
}

function buildNotificationBody(dueItems, variant) {
  if (dueItems.length >= 2) {
    return variant === "A"
      ? `苦戦したシーンが${dueItems.length}つ、リベンジ待ち。今日ならいけるはず。`
      : `${dueItems.length}つのシーンが、あなたの一言を待ってる。`;
  }
  const title = (dueItems[0].key || "").split("||")[1] || "あのシーン";
  const isRetry = (dueItems[0].fails || 1) >= 2;
  if (isRetry) {
    return variant === "A"
      ? `『${title}』、前回は惜しかった。次は通る。`
      : `『${title}』、あと一歩だった。今日で仕留めよう。`;
  }
  return variant === "A"
    ? `『${title}』、まだ終わってない。今日、決着をつけよう。`
    : `『${title}』、今日ならまだ通用する頭で挑める。`;
}

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

    const dueByUser = {};
    (users || []).forEach(u => {
      const queue = u.progress?.mdReviewQueue || [];
      const due = queue.filter(item => item.due <= today);
      if (due.length > 0) dueByUser[u.user_id] = due;
    });

    const dueUserIds = Object.keys(dueByUser);
    if (dueUserIds.length === 0) {
      return res.status(200).json({ dueUsers: 0, sent: 0, failed: 0 });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", dueUserIds);

    let sent = 0, failed = 0;
    const eventRows = [];
    for (const sub of subs || []) {
      const dueItems = dueByUser[sub.user_id];
      const variant = pickVariant(sub.user_id, NOTIF_EXPERIMENT, ["A", "B"]);
      const body = buildNotificationBody(dueItems, variant);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "TOP BINS",
            body,
            url: `/?notif=1&notif_variant=${variant}&notif_exp=${NOTIF_EXPERIMENT}`,
          })
        );
        sent++;
        eventRows.push({
          user_id: sub.user_id,
          name: "notification_sent",
          props: { experiment: NOTIF_EXPERIMENT, variant, due_count: dueItems.length },
        });
      } catch (e) {
        failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          // 購読が失効している（アンインストール・許可取り消し等）ので掃除する
          await supabase.from("push_subscriptions").delete().eq("user_id", sub.user_id);
        }
      }
    }

    if (eventRows.length > 0) {
      await supabase.from("events").insert(eventRows);
    }

    return res.status(200).json({ dueUsers: dueUserIds.length, sent, failed });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
