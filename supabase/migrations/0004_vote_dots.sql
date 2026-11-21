-- Version 2: a person can put more than one of their 3 votes (dots) on one
-- note. Each dot is one row, so the key can no longer be (note, member).
-- The trigger private.votes_limit still allows 3 rows for each person in a round.
-- The id is the last column, so an insert with 3 values in column order still works.
alter table public.votes drop constraint votes_pkey;
alter table public.votes add column id uuid not null default gen_random_uuid();
alter table public.votes add primary key (id);
create index on public.votes(note_id, member_id);
