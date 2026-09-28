-- ========================================================
--  LaoLao (ຮຽນພາສາລາວ) - Supabase PostgreSQL Schema
--  Run this SQL in your Supabase Dashboard:
--  SQL Editor -> New query -> Paste & Run
-- ========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users table (Learner profiles, roles, and settings)
create table if not exists public.users (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Access table (Subscription plans, free/premium tiers)
create table if not exists public.access (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Settings table (App-wide settings, default plan, branding)
create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Learning content: Sentence Patterns (ຮູບແບບປະໂຫຍກ)
create table if not exists public.patterns (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Learning content: Lessons (ບົດຮຽນ)
create table if not exists public.lessons (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. Learning content: Vocabulary & Audio (ຄຳສັບ)
create table if not exists public.vocab (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 7. Practice Quizzes & Flashcards (ບົດຝຶກຫັດ)
create table if not exists public.quizzes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 8. Spaced Repetition (SRS) Reviews (ທົບທວນ)
create table if not exists public.reviews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 9. Saved Patterns & Notes (ບັນທຶກ)
create table if not exists public.saved (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.notes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ========================================================
--  Row Level Security (RLS) Policies
-- ========================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.access enable row level security;
alter table public.settings enable row level security;
alter table public.patterns enable row level security;
alter table public.lessons enable row level security;
alter table public.vocab enable row level security;
alter table public.quizzes enable row level security;
alter table public.reviews enable row level security;
alter table public.saved enable row level security;
alter table public.notes enable row level security;

-- Public read for learning content and app settings
create policy "Allow read learning content" on public.patterns for select using (true);
create policy "Allow read lessons" on public.lessons for select using (true);
create policy "Allow read vocab" on public.vocab for select using (true);
create policy "Allow read quizzes" on public.quizzes for select using (true);
create policy "Allow read settings" on public.settings for select using (true);

-- Authenticated users can read and manage their own profile and access
create policy "Users can read own profile" on public.users for select using (auth.uid()::text = id);
create policy "Users can update own profile" on public.users for update using (auth.uid()::text = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid()::text = id);

create policy "Users can read own access" on public.access for select using (auth.uid()::text = id);
create policy "Users can insert own access" on public.access for insert with check (auth.uid()::text = id);

create policy "Users can manage own reviews" on public.reviews for all using (auth.uid()::text = split_part(id, '__', 1) or auth.uid()::text = (data->>'userId'));
create policy "Users can manage own saved" on public.saved for all using (auth.uid()::text = split_part(id, '__', 1) or auth.uid()::text = (data->>'userId'));
create policy "Users can manage own notes" on public.notes for all using (auth.uid()::text = split_part(id, '__', 1) or auth.uid()::text = (data->>'userId'));

-- Admin full access policy (owner can do anything)
-- Replace with your actual admin email if needed
create policy "Admin full access users" on public.users for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access access" on public.access for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access settings" on public.settings for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access patterns" on public.patterns for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access lessons" on public.lessons for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access vocab" on public.vocab for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access quizzes" on public.quizzes for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
