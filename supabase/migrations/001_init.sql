-- Self-Tuning Loop: Core Schema
-- Run this via `supabase db push` or paste into Supabase SQL Editor

-- Stores AI drafts and human-edited final versions
create table drafts (
  id uuid default gen_random_uuid() primary key,
  domain text not null,
  created_at timestamptz default now(),

  -- Generate
  input text,
  ai_draft text not null,
  guidelines_version int default 1,

  -- Capture
  human_final text,
  finalized_at timestamptz,
  diff_summary text,

  -- Feedback
  feedback_rating smallint check (feedback_rating between 1 and 5),
  feedback_comment text
);

-- Stores pattern analysis results
create table analysis_runs (
  id uuid default gen_random_uuid() primary key,
  domain text not null,
  analyzed_at timestamptz default now(),
  draft_count int,
  patterns jsonb,
  applied boolean default false
);

-- Version-controlled guidelines that evolve over time
create table guidelines (
  id serial primary key,
  domain text not null,
  version int not null,
  content text not null,
  created_at timestamptz default now(),
  source text check (source in ('manual', 'auto_evolve', 'review_suggestion')),
  analysis_run_id uuid references analysis_runs(id)
);

-- Indexes
create index idx_drafts_domain_finalized on drafts(domain, finalized_at)
  where human_final is not null;
create index idx_analysis_domain_pending on analysis_runs(domain, analyzed_at)
  where applied = false;
create index idx_guidelines_domain_version on guidelines(domain, version desc);

-- RLS (enable if using Supabase Auth)
-- alter table drafts enable row level security;
-- alter table analysis_runs enable row level security;
-- alter table guidelines enable row level security;
