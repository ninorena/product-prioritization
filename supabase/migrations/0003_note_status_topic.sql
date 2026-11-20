-- After a round (jobs 10 and 11): any person in the workspace can move a note
-- off the board (icebox, in progress, closed) and give it a topic label.
-- Both change only through the functions below, and only when the note's
-- round is closed. A null status means the note is on the board.

create type public.note_status as enum ('icebox', 'in_progress', 'closed');

alter table public.notes
  add column status public.note_status,
  add column topic text check (topic is null or char_length(topic) between 1 and 60);

-- The browser may write only these columns. Status and topic go through the
-- functions, so a person cannot set them on a note during the brainstorm.
revoke insert, update on public.notes from authenticated;
grant insert (workspace_id, round_id, member_id, response_id, body) on public.notes to authenticated;
grant update (body) on public.notes to authenticated;

-- The workspace of a note, if the caller is in it and its round is closed.
create function private.closed_note_workspace(p_note uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid;
begin
  select n.workspace_id into ws
  from public.notes n
  where n.id = p_note
    and private.round_step(n.round_id) = 'closed'
    and private.my_member_id(n.workspace_id) is not null;
  if ws is null then
    raise exception 'only a person in the workspace can change a note, after its round is closed';
  end if;
  return ws;
end $$;
revoke all on function private.closed_note_workspace(uuid) from public, anon;
grant execute on function private.closed_note_workspace(uuid) to authenticated;

create function public.set_note_status(p_note uuid, p_status public.note_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.closed_note_workspace(p_note);
  update public.notes set status = p_status where id = p_note;
end $$;

-- An empty topic clears the label.
create function public.set_note_topic(p_note uuid, p_topic text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.closed_note_workspace(p_note);
  update public.notes set topic = nullif(btrim(p_topic), '') where id = p_note;
end $$;

revoke execute on function public.set_note_status(uuid, public.note_status),
  public.set_note_topic(uuid, text) from public, anon;
grant execute on function public.set_note_status(uuid, public.note_status),
  public.set_note_topic(uuid, text) to authenticated;
