import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Member, Round, Workspace } from './types';
import { NEXT_ACTION, STEP_LABEL, STEPS } from './types';
import { Brainstorm } from './Brainstorm';
import { BoardStep } from './BoardStep';
import { Results } from './Results';
import { OffBoard } from './OffBoard';
import { WriteNow } from './WriteNow';

export function WorkspaceView({ id, session }: { id: string; session: Session }) {
  const [ws, setWs] = useState<Workspace | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState('');
  // Goes up when a person changes the status or topic of a note, so that
  // the result and the list of notes off the board load again.
  const [notesVersion, setNotesVersion] = useState(0);
  const notesChanged = useCallback(() => setNotesVersion((v) => v + 1), []);

  const load = useCallback(async () => {
    const [w, m, mine, r] = await Promise.all([
      supabase.from('workspaces').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*').eq('workspace_id', id).order('created_at'),
      supabase.rpc('my_member', { p_workspace: id }),
      supabase.from('rounds').select('*').eq('workspace_id', id).order('created_at', { ascending: false }).limit(1),
    ]);
    setWs(w.data ?? null);
    setMembers(m.data ?? []);
    setMe((mine.data as string | null) ?? null);
    setRound(r.data?.[0] ?? null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load, session.user.id]);

  // Async work: other people move on while this page is open.
  useEffect(() => {
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('rounds').select('*').eq('workspace_id', id)
        .order('created_at', { ascending: false }).limit(1);
      const next = data?.[0] ?? null;
      // A slow answer must never move the screen back to an earlier step.
      setRound((cur) => {
        if (!next || (cur && cur.id === next.id && STEPS.indexOf(next.step) <= STEPS.indexOf(cur.step))) return cur;
        return next;
      });
    }, 10000);
    return () => clearInterval(t);
  }, [id]);

  if (ws === undefined) return <main><p>Loading…</p></main>;
  if (ws === null || !me)
    return (
      <main data-testid="no-access">
        <p>You do not have access to this workspace.</p>
        <a href="#/">Back</a>
      </main>
    );

  const isLead = members.some((m) => m.id === me && m.role === 'lead');
  const myName = members.find((m) => m.id === me)?.display_name;

  async function startRound() {
    setError('');
    const { error } = await supabase.rpc('start_round', { p_workspace: id });
    if (error) setError(error.message);
    await load();
  }

  async function advance() {
    if (!round) return;
    setError('');
    const { error } = await supabase.rpc('advance_round', { p_round: round.id, p_from: round.step });
    if (error) setError(error.message);
    await load();
  }

  return (
    <main data-testid="workspace">
      <header className="bar no-print">
        <a href="#/">All workspaces</a>
        <span>Signed in as {myName}{isLead ? ' (lead)' : ''}</span>
        <button onClick={load}>Refresh</button>
      </header>
      <h1>{ws.name}</h1>

      {isLead && <MembersPanel workspaceId={id} members={members} onChange={load} />}

      <section className="no-print">
        <h2>Round</h2>
        {round ? (
          <p data-testid="round-step" data-step={round.step}>Step: {STEP_LABEL[round.step]}</p>
        ) : (
          <p data-testid="round-step" data-step="none">No round yet.</p>
        )}
        {isLead && (!round || round.step === 'closed') && (
          <button onClick={startRound}>Start a round</button>
        )}
        {isLead && round && NEXT_ACTION[round.step] && (
          <button data-testid="advance" onClick={advance}>{NEXT_ACTION[round.step]}</button>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {round?.step === 'brainstorm' && <Brainstorm key={round.id} workspaceId={id} round={round} me={me} />}
      {round && ['placement', 'compare', 'vote'].includes(round.step) && (
        <BoardStep key={round.id + round.step} round={round} me={me} members={members} />
      )}
      {round?.step === 'closed' && (
        <Results key={round.id} round={round} members={members} version={notesVersion} onChange={notesChanged} />
      )}
      {round?.step !== 'brainstorm' && <WriteNow key={`write-${round?.id ?? 'none'}`} workspaceId={id} me={me} />}
      <OffBoard workspaceId={id} version={notesVersion} onChange={notesChanged} />
    </main>
  );
}

function MembersPanel({ workspaceId, members, onChange }: { workspaceId: string; members: Member[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const others = members.filter((m) => m.role === 'member');

  const linkFor = (token: string) => `${window.location.origin}${window.location.pathname}#/j/${token}`;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { data, error } = await supabase.rpc('add_member', { p_workspace: workspaceId, p_name: name });
    if (error) return setError(error.message);
    const row = (data as { member_id: string; token: string }[])[0];
    setLink({ name, url: linkFor(row.token) });
    setName('');
    onChange();
  }

  async function newLink(m: Member) {
    setError('');
    const { data, error } = await supabase.rpc('new_member_link', { p_member: m.id });
    if (error) return setError(error.message);
    setLink({ name: m.display_name, url: linkFor(data as string) });
    onChange();
  }

  async function cancel(m: Member) {
    setError('');
    const { error } = await supabase.rpc('cancel_member_link', { p_member: m.id });
    if (error) return setError(error.message);
    if (link?.name === m.display_name) setLink(null);
    onChange();
  }

  return (
    <section className="no-print" data-testid="members">
      <h2>Members ({others.length} of 5)</h2>
      <ul>
        {others.map((m) => (
          <li key={m.id} data-testid="member-row">
            <span>{m.display_name}</span> <small>{m.link_active ? 'link active' : 'link canceled'}</small>{' '}
            <button onClick={() => newLink(m)}>Make a new link</button>{' '}
            {m.link_active && <button onClick={() => cancel(m)}>Cancel the link</button>}
          </li>
        ))}
      </ul>
      {link && (
        <div className="link-box">
          <p>
            Private link for {link.name}. Copy it and send it yourself. It is shown only one time.
          </p>
          <input readOnly data-testid="member-link" value={link.url} onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard?.writeText(link.url)}>Copy</button>
        </div>
      )}
      {others.length < 5 && (
        <form onSubmit={add}>
          <label>
            Name <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit">Add a member</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
