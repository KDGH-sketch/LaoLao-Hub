-- ========================================================
--  LaoLao (ຮຽນພາສາລາວ) - Complete Supabase PostgreSQL Schema
--  Run this SQL in your Supabase Dashboard:
--  SQL Editor -> New query -> Paste & Run
-- ========================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Core User & Identity Management
create table if not exists public.users (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.admins (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.adminNotes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Subscription, Plans & Access Entitlements
create table if not exists public.access (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.plans (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Application Settings & Configuration
create table if not exists public.settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Curriculum Content Tables (Dedicated Table for Every Menu Item)
create table if not exists public.lessons (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.patterns (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.grammar (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vocabulary (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Maintain backward-compatible alias for vocab table
create table if not exists public.vocab (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.dialogues (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.quizzes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.videos (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tones (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.culture (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.characters (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.dictionary (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.audio (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lexicon (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.paths (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.releases (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.bundles (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Learner Tracking, Progress & Spaced Repetition (SRS)
create table if not exists public.progress (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.reviews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

create table if not exists public.activity (
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
alter table public.admins enable row level security;
alter table public.adminNotes enable row level security;
alter table public.access enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.settings enable row level security;
alter table public.lessons enable row level security;
alter table public.patterns enable row level security;
alter table public.grammar enable row level security;
alter table public.vocabulary enable row level security;
alter table public.vocab enable row level security;
alter table public.dialogues enable row level security;
alter table public.quizzes enable row level security;
alter table public.videos enable row level security;
alter table public.tones enable row level security;
alter table public.culture enable row level security;
alter table public.characters enable row level security;
alter table public.dictionary enable row level security;
alter table public.audio enable row level security;
alter table public.lexicon enable row level security;
alter table public.paths enable row level security;
alter table public.releases enable row level security;
alter table public.bundles enable row level security;
alter table public.progress enable row level security;
alter table public.reviews enable row level security;
alter table public.saved enable row level security;
alter table public.notes enable row level security;
alter table public.activity enable row level security;

-- Public Read for Published Content and Plans
create policy "Public read lessons" on public.lessons for select using (true);
create policy "Public read patterns" on public.patterns for select using (true);
create policy "Public read grammar" on public.grammar for select using (true);
create policy "Public read vocabulary" on public.vocabulary for select using (true);
create policy "Public read vocab" on public.vocab for select using (true);
create policy "Public read dialogues" on public.dialogues for select using (true);
create policy "Public read quizzes" on public.quizzes for select using (true);
create policy "Public read videos" on public.videos for select using (true);
create policy "Public read tones" on public.tones for select using (true);
create policy "Public read culture" on public.culture for select using (true);
create policy "Public read characters" on public.characters for select using (true);
create policy "Public read dictionary" on public.dictionary for select using (true);
create policy "Public read audio" on public.audio for select using (true);
create policy "Public read lexicon" on public.lexicon for select using (true);
create policy "Public read paths" on public.paths for select using (true);
create policy "Public read releases" on public.releases for select using (true);
create policy "Public read bundles" on public.bundles for select using (true);
create policy "Public read plans" on public.plans for select using (true);
create policy "Public read settings" on public.settings for select using (true);

-- User-scoped CRUD
create policy "Users manage own profile" on public.users for all using (auth.uid()::text = id);
create policy "Users read own access" on public.access for select using (auth.uid()::text = id);
create policy "Users manage own progress" on public.progress for all using (auth.uid()::text = id or auth.uid()::text = split_part(id, '__', 1));
create policy "Users manage own reviews" on public.reviews for all using (auth.uid()::text = id or auth.uid()::text = split_part(id, '__', 1));
create policy "Users manage own saved" on public.saved for all using (auth.uid()::text = id or auth.uid()::text = split_part(id, '__', 1));
create policy "Users manage own notes" on public.notes for all using (auth.uid()::text = id or auth.uid()::text = split_part(id, '__', 1));

-- Platform Owner / Super Admin Full Access Policy
-- Replace 'kindathanomsuck@gmail.com' with your admin email
create policy "Admin full access users" on public.users for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access admins" on public.admins for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access adminNotes" on public.adminNotes for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access access" on public.access for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access plans" on public.plans for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access subscriptions" on public.subscriptions for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access settings" on public.settings for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access lessons" on public.lessons for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access patterns" on public.patterns for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access grammar" on public.grammar for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access vocabulary" on public.vocabulary for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access vocab" on public.vocab for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access dialogues" on public.dialogues for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access quizzes" on public.quizzes for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access videos" on public.videos for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access tones" on public.tones for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access culture" on public.culture for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access characters" on public.characters for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access dictionary" on public.dictionary for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access audio" on public.audio for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access lexicon" on public.lexicon for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access paths" on public.paths for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access releases" on public.releases for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access bundles" on public.bundles for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access progress" on public.progress for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access reviews" on public.reviews for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access saved" on public.saved for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access notes" on public.notes for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
create policy "Admin full access activity" on public.activity for all using ((auth.jwt() ->> 'email') = 'kindathanomsuck@gmail.com');
