-- entitlements テーブル: Apple App版の無料権限フラグ
-- PWA(topbins.vercel.app)はこのテーブルを一切参照しない（常に無料のまま）。
-- Apple App版のみ、ネイティブ判定時にこのテーブルを見て課金要否を決める。
--
-- 【重要】クライアント側のコード（index.html）はこのテーブルへの
-- INSERT/UPDATE/DELETEを一切行わない。selectのみ。
-- 選手・身内への無料付与は、Supabaseダッシュボードの Table Editor から
-- 手動で行毎/is_complimentary=true を設定する運用（招待コード等は不要）。
--
-- 実行方法: Supabaseダッシュボード → SQL Editor に貼り付けて実行。

create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_complimentary boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

-- 本人の行だけ読める（自分が無料対象かどうかの確認用）
drop policy if exists "select own entitlement" on entitlements;
create policy "select own entitlement"
  on entitlements for select
  using (auth.uid() = user_id);

-- insert/update/deleteのポリシーは意図的に作らない。
-- anon/authenticatedロールからの書き込みは常に拒否される
-- （RLSはデフォルトdeny。書き込みはSupabaseダッシュボード＝service_role経由のみ）。
