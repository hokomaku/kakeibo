-- Run this in the NEW household-only Supabase project's SQL Editor.
-- Do not run in your existing unrelated project.
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '夫婦の家計簿',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, kind, name),
  unique (household_id, id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_date date not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid not null,
  amount_yen integer not null check (amount_yen > 0),
  payer text not null check (payer in ('you','wife')),
  is_credit boolean not null default false,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, category_id) references public.categories(household_id, id),
  check (kind = 'expense' or is_credit = false)
);
create index if not exists transactions_household_date_idx on public.transactions(household_id, entry_date desc);
create index if not exists transactions_household_category_idx on public.transactions(household_id, category_id);
create index if not exists transactions_household_credit_idx on public.transactions(household_id, entry_date) where is_credit;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null check (extract(day from budget_month) = 1),
  category_id uuid,
  is_total boolean generated always as (category_id is null) stored,
  amount_yen integer not null check (amount_yen >= 0),
  updated_at timestamptz not null default now(),
  foreign key (household_id, category_id) references public.categories(household_id, id),
  unique nulls not distinct (household_id, budget_month, category_id)
);
create index if not exists budgets_household_month_idx on public.budgets(household_id, budget_month);

create table if not exists public.credit_monthly_totals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  target_month date not null check (extract(day from target_month) = 1),
  actual_amount_yen integer not null check (actual_amount_yen >= 0),
  memo text not null default '',
  updated_at timestamptz not null default now(),
  unique (household_id, target_month)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.credit_monthly_totals enable row level security;

-- Membership rows are only visible to the logged-in member themselves.
create policy "members read own membership" on public.household_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "members read household" on public.households
  for select to authenticated using (public.is_household_member(id));

create policy "members read categories" on public.categories
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add categories" on public.categories
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update categories" on public.categories
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "members read transactions" on public.transactions
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add transactions" on public.transactions
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update transactions" on public.transactions
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members delete transactions" on public.transactions
  for delete to authenticated using (public.is_household_member(household_id));

create policy "members read budgets" on public.budgets
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add budgets" on public.budgets
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update budgets" on public.budgets
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members delete budgets" on public.budgets
  for delete to authenticated using (public.is_household_member(household_id));

create policy "members read credit totals" on public.credit_monthly_totals
  for select to authenticated using (public.is_household_member(household_id));
create policy "members add credit totals" on public.credit_monthly_totals
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update credit totals" on public.credit_monthly_totals
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members delete credit totals" on public.credit_monthly_totals
  for delete to authenticated using (public.is_household_member(household_id));

grant select on public.households, public.household_members to authenticated;
grant select, insert, update on public.categories to authenticated;
grant select, insert, update, delete on public.transactions, public.budgets, public.credit_monthly_totals to authenticated;

-- After both accounts have been invited/created in Supabase Auth, replace the
-- two UUID placeholders below and run the bootstrap SQL in SQL Editor.
-- This creates one shared household, grants both users membership, and seeds categories.
--
-- with new_household as (
--   insert into public.households (name) values ('夫婦の家計簿') returning id
-- )
-- insert into public.household_members (household_id, user_id, role)
-- select id, 'REPLACE_WITH_FIRST_AUTH_USER_UUID'::uuid, 'owner' from new_household
-- union all
-- select id, 'REPLACE_WITH_SECOND_AUTH_USER_UUID'::uuid, 'member' from new_household;
--
-- Then seed categories with the resulting household UUID:
-- insert into public.categories (household_id, name, kind) values
-- ('HOUSEHOLD_UUID'::uuid,'スーパー','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'外食','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'コンビニ','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'日用品','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'交通費','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'光熱費','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'通信費','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'住居費','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'医療費','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'娯楽','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'その他','expense'),
-- ('HOUSEHOLD_UUID'::uuid,'給与','income'),
-- ('HOUSEHOLD_UUID'::uuid,'賞与','income'),
-- ('HOUSEHOLD_UUID'::uuid,'副収入','income'),
-- ('HOUSEHOLD_UUID'::uuid,'還付金','income'),
-- ('HOUSEHOLD_UUID'::uuid,'その他','income');
