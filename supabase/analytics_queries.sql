-- 参照クエリ集: events テーブルを「見る」ための出発点。
-- Supabase SQL Editorに個別に貼り付けて実行する（一括実行は不要）。
-- 溜めるだけで見なければ意味がないので、週1目安でここから覗く運用を想定。

-- ============ 1. Day別継続率（cohort retention） ============
-- 登録から何日目に、何人がapp_openしているか
select
  date_trunc('day', u.created_at) as cohort_day,
  date_trunc('day', e.created_at) - date_trunc('day', u.created_at) as days_since_signup,
  count(distinct e.user_id) as active_users
from auth.users u
join events e on e.user_id = u.id and e.name = 'app_open'
group by 1, 2
order by 1, 2;

-- ============ 2. ROLEPLAY Day別の完了者数（どこで離脱するか） ============
select
  (props->>'day')::int as day_number,
  count(distinct user_id) as completions
from events
where name = 'day_complete'
group by 1
order by 1;

-- ============ 3. MATCHDAYのスコア分布・判定別カウント ============
select
  props->>'verdict' as verdict,
  count(*) as n,
  round(avg((props->>'score')::numeric), 1) as avg_score
from events
where name = 'matchday_played'
group by 1
order by avg_score desc;

-- ============ 4. ミッション種別ごとの完了頻度 ============
select
  props->>'mission' as mission,
  count(*) as completions,
  count(distinct user_id) as unique_users
from events
where name = 'mission_complete'
group by 1
order by 2 desc;

-- ============ 5. MAKE IT YOURSの完了率（complete vs skip） ============
select
  name,
  count(*) as n
from events
where name in ('make_it_yours_complete', 'make_it_yours_skip')
group by 1;

-- ============ 6. ストリーク途切れの発生状況 ============
select
  date_trunc('day', created_at) as day,
  count(*) as breaks,
  round(avg((props->>'previous_streak')::numeric), 1) as avg_streak_lost
from events
where name = 'streak_broken'
group by 1
order by 1 desc;

-- ============ 7. 実験（A/Bテスト）のバリアント別イベント数 ============
-- experiment_variant()で振り分けたイベントを追う場合のテンプレート
-- select
--   props->>'experiment' as experiment,
--   props->>'variant' as variant,
--   name,
--   count(*) as n
-- from events
-- where props ? 'experiment'
-- group by 1, 2, 3
-- order by 1, 2, 3;

-- ============ 8. 復習通知のバリアント別クリック率（CTR） ============
-- notification_sent（サーバ側、api/send-review-notifications.js）と
-- notification_clicked（クライアント側、?notif=1経由）を突き合わせる
select
  s.props->>'variant' as variant,
  count(distinct s.id) as sent,
  count(distinct c.id) as clicked,
  round(count(distinct c.id)::numeric / nullif(count(distinct s.id), 0) * 100, 1) as ctr_pct
from events s
left join events c
  on c.user_id = s.user_id
  and c.name = 'notification_clicked'
  and c.props->>'variant' = s.props->>'variant'
  and c.created_at between s.created_at and s.created_at + interval '2 days'
where s.name = 'notification_sent'
group by 1
order by 1;
