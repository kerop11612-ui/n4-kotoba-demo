create table public.learning_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  device_id text not null,
  event_type text not null check (event_type in ('review', 'manual_mastery', 'memory_snapshot')),
  word_id text not null,
  unit_id text not null,
  skill text not null check (skill in ('jp_to_meaning', 'meaning_to_jp', 'kanji_to_reading', 'audio_to_meaning', 'context_to_word')),
  occurred_at timestamptz not null,
  payload jsonb not null,
  server_seq bigint generated always as identity,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create unique index learning_events_user_server_seq_idx
  on public.learning_events (user_id, server_seq);

alter table public.learning_events enable row level security;

create policy "owner selects learning events"
  on public.learning_events for select
  to authenticated using (auth.uid() = user_id);

create policy "owner inserts learning events"
  on public.learning_events for insert
  to authenticated with check (auth.uid() = user_id);

create policy "owner deletes learning events"
  on public.learning_events for delete
  to authenticated using (auth.uid() = user_id);
