-- WhatsNext schema. Run in Supabase SQL editor.
-- RLS deny-all for anon/authenticated; server uses service role.

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  importance int not null default 3 check (importance between 1 and 5),
  estimate_minutes int,
  due_at timestamptz,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  parent_id uuid references todos(id) on delete cascade
);

create index if not exists todos_parent_id_idx on todos(parent_id);
create index if not exists todos_is_done_idx on todos(is_done);

create table if not exists daily_plans (
  day date primary key,
  recommended_todo_id uuid references todos(id) on delete set null,
  headline text not null,
  rationale text not null default '',
  context_summary text not null default '',
  email_id text,
  created_at timestamptz not null default now()
);

alter table todos enable row level security;
alter table daily_plans enable row level security;

-- No policies for anon/authenticated → deny all via RLS.
-- Service role bypasses RLS.
