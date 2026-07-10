-- push_subscriptions テーブル: Web Push購読情報の保存
-- entitlements/eventsと違い、ユーザーが自分の購読を作成・更新・解除できる必要がある
-- （ブラウザ側のPushManager.subscribe()が返す情報をそのまま保存するだけの用途）。
--
-- 実行方法: Supabaseダッシュボード → SQL Editor に貼り付けて実行。

create table if not exists push_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "manage own subscription" on push_subscriptions;
create policy "manage own subscription"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
