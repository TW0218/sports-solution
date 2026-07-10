-- events テーブル: 自前の行動計測基盤（外部SaaS不使用）
-- 設計方針:
--   - クライアントは自分のイベントをinsertするだけ。selectポリシーは意図的に作らない
--     （分析はSupabaseダッシュボードのSQL Editor = service_role経由でのみ行う）
--   - イベント種別ごとにテーブルを分けず、propsをjsonbにして柔軟に持たせる
--   - どれだけ溜めても「見る」習慣がなければ意味がないため、analytics_queries.sql に
--     継続率・ファネルの参照クエリを用意してある
--
-- 実行方法: Supabaseダッシュボード → SQL Editor に貼り付けて実行。

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on events(user_id);
create index if not exists events_name_created_at_idx on events(name, created_at);

alter table events enable row level security;

-- 本人のイベントのみinsert可能。select/update/deleteのポリシーは意図的に作らない
-- （クライアントは書き込み専用。読み出しはservice_role経由のみ）
drop policy if exists "insert own events" on events;
create policy "insert own events"
  on events for insert
  with check (auth.uid() = user_id);
