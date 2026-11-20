-- One round: workspaces, members, private links, responses, notes,
-- placements on each own board, and votes.
--
-- Rule of the file: the browser talks to the database with the anon key,
-- so every table has row level security, and every change that needs more
-- than "my own row" goes through a security definer function that checks
-- the caller first.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- The people who can make workspaces. Filled by scripts/sb.mjs lead.
create table private.leads (
  email text primary key
);

create type public.round_step as enum ('brainstorm', 'placement', 'compare', 'vote', 'closed');
create type public.member_role as enum ('lead', 'member');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  role public.member_role not null default 'member',
  -- Set only for the lead. Members sign in through private.member_sessions.
  user_id uuid references auth.users(id) on delete cascade,
  link_active boolean not null default false,
  created_at timestamptz not null default now(),
  check ((role = 'lead') = (user_id is not null))
);
create index on public.members(workspace_id);

-- The hash of each member's private link. Never readable through the API.
create table private.member_tokens (
  member_id uuid primary key references public.members(id) on delete cascade,
  token_hash bytea not null unique
);

-- Which signed-in (anonymous) user acts as which member.
-- One member can have more than one session: a second device.
create table private.member_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, member_id)
);
create index on private.member_sessions(member_id);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  step public.round_step not null default 'brainstorm',
  created_at timestamptz not null default now()
);
create index on public.rounds(workspace_id);
-- At most one round that is not closed, in each workspace.
create unique index rounds_one_open on public.rounds(workspace_id) where step <> 'closed';

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  prompt text check (prompt is null or char_length(prompt) <= 300),
  body text not null check (char_length(body) between 1 and 2000),
  question_unknown boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.responses(workspace_id, member_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  response_id uuid references public.responses(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on public.notes(round_id);

-- x: 0 = Harder, 1 = Easier. y: 0 = Less important, 1 = More important.
-- No note sits on a line: 0.5 is not allowed on either axis.
create table public.placements (
  note_id uuid not null references public.notes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  x double precision not null check (x > 0 and x < 1 and x <> 0.5),
  y double precision not null check (y > 0 and y < 1 and y <> 0.5),
  updated_at timestamptz not null default now(),
  primary key (note_id, member_id)
);
create index on public.placements(round_id);

create table public.votes (
  note_id uuid not null references public.notes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, member_id)
);
create index on public.votes(round_id);

-- ---------------------------------------------------------------------------
-- Helpers used by the policies. Security definer, so that they can read
-- private.member_sessions. They only answer questions about the caller.
-- ---------------------------------------------------------------------------

create function private.my_member_id(ws uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.members m
  where m.workspace_id = ws
    and (
      (m.role = 'lead' and m.user_id = (select auth.uid()))
      or (
        m.role = 'member' and m.link_active
        and exists (
          select 1 from private.member_sessions s
          where s.member_id = m.id and s.user_id = (select auth.uid())
        )
      )
    )
  limit 1
$$;

create function private.is_lead(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = (select auth.uid())
  )
$$;

create function private.round_step(r uuid) returns public.round_step
language sql stable security definer set search_path = '' as $$
  select step from public.rounds where id = r
$$;

create function private.round_workspace(r uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select workspace_id from public.rounds where id = r
$$;

revoke all on function private.my_member_id(uuid), private.is_lead(uuid),
  private.round_step(uuid), private.round_workspace(uuid) from public, anon;
grant execute on function private.my_member_id(uuid), private.is_lead(uuid),
  private.round_step(uuid), private.round_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.rounds enable row level security;
alter table public.responses enable row level security;
alter table public.notes enable row level security;
alter table public.placements enable row level security;
alter table public.votes enable row level security;

-- Nothing in this app is for a caller with no session.
revoke all on public.workspaces, public.members, public.rounds, public.responses,
  public.notes, public.placements, public.votes from anon;
-- Do not rely on the project's default grants. The policies do the filtering.
grant select on public.workspaces, public.members, public.rounds to authenticated;
grant select, insert, update, delete on public.responses, public.notes,
  public.placements, public.votes to authenticated;
grant all on public.workspaces, public.members, public.rounds, public.responses,
  public.notes, public.placements, public.votes to service_role;

-- Workspaces, members and rounds: readable by the people in the workspace.
-- They change only through the functions below.
create policy workspaces_read on public.workspaces for select to authenticated
  using (private.my_member_id(id) is not null);
create policy members_read on public.members for select to authenticated
  using (private.my_member_id(workspace_id) is not null);
create policy rounds_read on public.rounds for select to authenticated
  using (private.my_member_id(workspace_id) is not null);

-- Responses: private to the person who wrote them.
create policy responses_own on public.responses for all to authenticated
  using (member_id = private.my_member_id(workspace_id))
  with check (member_id = private.my_member_id(workspace_id));

-- Notes: the author sees them at once. The other people see them only after
-- the lead closes the brainstorm, when all the notes go into one pool.
create policy notes_read on public.notes for select to authenticated
  using (
    member_id = private.my_member_id(workspace_id)
    or (private.my_member_id(workspace_id) is not null
        and private.round_step(round_id) <> 'brainstorm')
  );
create policy notes_insert on public.notes for insert to authenticated
  with check (
    member_id = private.my_member_id(workspace_id)
    and private.round_workspace(round_id) = workspace_id
    and private.round_step(round_id) = 'brainstorm'
  );
create policy notes_update on public.notes for update to authenticated
  using (member_id = private.my_member_id(workspace_id) and private.round_step(round_id) = 'brainstorm')
  with check (member_id = private.my_member_id(workspace_id) and private.round_step(round_id) = 'brainstorm');
create policy notes_delete on public.notes for delete to authenticated
  using (member_id = private.my_member_id(workspace_id) and private.round_step(round_id) = 'brainstorm');

-- The columns that tie a note to its place may never change.
create function private.notes_freeze() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id <> old.workspace_id or new.round_id <> old.round_id
     or new.member_id <> old.member_id then
    raise exception 'a note cannot move to another workspace, round or author';
  end if;
  return new;
end $$;
create trigger notes_freeze before update on public.notes
  for each row execute function private.notes_freeze();

-- Placements: a person reads their own board. The other boards become
-- readable when the lead opens the compare step, and stay readable.
create policy placements_read on public.placements for select to authenticated
  using (
    member_id = private.my_member_id(private.round_workspace(round_id))
    or (private.my_member_id(private.round_workspace(round_id)) is not null
        and private.round_step(round_id) in ('compare', 'vote', 'closed'))
  );
create policy placements_write on public.placements for insert to authenticated
  with check (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) in ('placement', 'compare')
    and exists (select 1 from public.notes n where n.id = note_id and n.round_id = placements.round_id)
  );
create policy placements_update on public.placements for update to authenticated
  using (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) in ('placement', 'compare')
  )
  with check (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) in ('placement', 'compare')
  );
create policy placements_delete on public.placements for delete to authenticated
  using (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) in ('placement', 'compare')
  );

-- Votes: a person reads their own votes. All the votes, and so the counts,
-- become readable when the lead closes the vote.
create policy votes_read on public.votes for select to authenticated
  using (
    member_id = private.my_member_id(private.round_workspace(round_id))
    or (private.my_member_id(private.round_workspace(round_id)) is not null
        and private.round_step(round_id) = 'closed')
  );
create policy votes_insert on public.votes for insert to authenticated
  with check (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) = 'vote'
    and exists (select 1 from public.notes n where n.id = note_id and n.round_id = votes.round_id)
  );
create policy votes_delete on public.votes for delete to authenticated
  using (
    member_id = private.my_member_id(private.round_workspace(round_id))
    and private.round_step(round_id) = 'vote'
  );

-- Each person has 3 votes in a round.
create function private.votes_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.member_id::text || new.round_id::text));
  if (select count(*) from public.votes v
      where v.member_id = new.member_id and v.round_id = new.round_id) >= 3 then
    raise exception 'each person has 3 votes';
  end if;
  return new;
end $$;
create trigger votes_limit before insert on public.votes
  for each row execute function private.votes_limit();

-- ---------------------------------------------------------------------------
-- Functions the app calls (POST /rest/v1/rpc/<name>)
-- ---------------------------------------------------------------------------

-- The daily keepalive job calls this with the anon key.
create function public.ping() returns integer
language sql stable as $$ select 1 $$;
grant execute on function public.ping() to anon, authenticated;

create function public.am_i_lead() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
     and exists (
       select 1 from private.leads l
       where l.email = lower((select auth.jwt() ->> 'email'))
     )
$$;

create function public.create_workspace(p_name text, p_lead_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if not public.am_i_lead() then
    raise exception 'only a lead can make a workspace';
  end if;
  insert into public.workspaces(name, owner_id) values (p_name, auth.uid()) returning id into ws;
  insert into public.members(workspace_id, display_name, role, user_id)
    values (ws, p_lead_name, 'lead', auth.uid());
  return ws;
end $$;

-- Makes a new random token, stores only its hash, and returns the token.
create function private.issue_token(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into private.member_tokens(member_id, token_hash)
    values (p_member, extensions.digest(tok, 'sha256'))
    on conflict (member_id) do update set token_hash = excluded.token_hash;
  delete from private.member_sessions where member_id = p_member;
  update public.members set link_active = true where id = p_member;
  return tok;
end $$;
revoke all on function private.issue_token(uuid) from public, anon, authenticated;

create function public.add_member(p_workspace uuid, p_name text)
returns table (member_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare m uuid;
begin
  if not private.is_lead(p_workspace) then
    raise exception 'only the lead can add a member';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text));
  if (select count(*) from public.members
      where workspace_id = p_workspace and role = 'member') >= 5 then
    raise exception 'a workspace has a maximum of 5 members';
  end if;
  insert into public.members(workspace_id, display_name) values (p_workspace, p_name)
    returning id into m;
  return query select m, private.issue_token(m);
end $$;

-- Cancels the old link (and every session that used it) and makes a new one.
create function public.new_member_link(p_member uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members m
                 where m.id = p_member and m.role = 'member' and private.is_lead(m.workspace_id)) then
    raise exception 'only the lead can make a link';
  end if;
  return private.issue_token(p_member);
end $$;

create function public.cancel_member_link(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members m
                 where m.id = p_member and m.role = 'member' and private.is_lead(m.workspace_id)) then
    raise exception 'only the lead can cancel a link';
  end if;
  delete from private.member_tokens where member_id = p_member;
  delete from private.member_sessions where member_id = p_member;
  update public.members set link_active = false where id = p_member;
end $$;

-- Connects the caller's session to the member that owns the token.
-- Returns the workspace id, or null when the link is not valid.
create function public.claim_link(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  if auth.uid() is null then
    return null;
  end if;
  select mem.* into m
  from private.member_tokens t
  join public.members mem on mem.id = t.member_id
  where t.token_hash = extensions.digest(p_token, 'sha256') and mem.link_active;
  if m.id is null then
    return null;
  end if;
  insert into private.member_sessions(user_id, member_id) values (auth.uid(), m.id)
    on conflict do nothing;
  return m.workspace_id;
end $$;

create function public.start_round(p_workspace uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  if not private.is_lead(p_workspace) then
    raise exception 'only the lead can start a round';
  end if;
  insert into public.rounds(workspace_id) values (p_workspace) returning id into r;
  return r;
end $$;

-- Moves the round one step forward. Only the lead can do it.
create function public.advance_round(p_round uuid) returns public.round_step
language plpgsql security definer set search_path = '' as $$
declare cur public.round_step; nxt public.round_step;
begin
  if not private.is_lead(private.round_workspace(p_round)) then
    raise exception 'only the lead can move the round to the next step';
  end if;
  select step into cur from public.rounds where id = p_round for update;
  nxt := case cur
    when 'brainstorm' then 'placement'
    when 'placement' then 'compare'
    when 'compare' then 'vote'
    when 'vote' then 'closed'
  end;
  if nxt is null then
    raise exception 'the round is closed';
  end if;
  update public.rounds set step = nxt where id = p_round;
  return nxt;
end $$;

revoke execute on function public.am_i_lead(), public.create_workspace(text, text),
  public.add_member(uuid, text), public.new_member_link(uuid), public.cancel_member_link(uuid),
  public.claim_link(text), public.start_round(uuid), public.advance_round(uuid)
  from public, anon;
grant execute on function public.am_i_lead(), public.create_workspace(text, text),
  public.add_member(uuid, text), public.new_member_link(uuid), public.cancel_member_link(uuid),
  public.claim_link(text), public.start_round(uuid), public.advance_round(uuid)
  to authenticated;

-- The member id of the caller in a workspace, or null.
create function public.my_member(p_workspace uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select private.my_member_id(p_workspace)
$$;
revoke execute on function public.my_member(uuid) from public, anon;
grant execute on function public.my_member(uuid) to authenticated;
