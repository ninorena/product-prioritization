-- The lead's button moves the round from the step the lead saw. A second
-- click, or a click from a stale page, must not skip a step.
drop function public.advance_round(uuid);

create function public.advance_round(p_round uuid, p_from public.round_step) returns public.round_step
language plpgsql security definer set search_path = '' as $$
declare cur public.round_step; nxt public.round_step;
begin
  if not private.is_lead(private.round_workspace(p_round)) then
    raise exception 'only the lead can move the round to the next step';
  end if;
  select step into cur from public.rounds where id = p_round for update;
  if cur is distinct from p_from then
    raise exception 'the round already moved on. Refresh the page';
  end if;
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

revoke execute on function public.advance_round(uuid, public.round_step) from public, anon;
grant execute on function public.advance_round(uuid, public.round_step) to authenticated;
