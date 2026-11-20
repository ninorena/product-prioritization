import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type { Member, Note, Placement, Round, Vote } from './types';
import { offLine, quadrant } from './quadrant';

const VOTES = 3;

export function BoardStep({ round, me, members }: { round: Round; me: string; members: Member[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string>(me);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);

  // Each load and each change takes a number. A load applies its result
  // only if nothing started after it, so a slow load cannot undo a change.
  const gen = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const g = ++gen.current;
    const [n, p, v] = await Promise.all([
      supabase.from('notes').select('*').eq('round_id', round.id).order('created_at'),
      supabase.from('placements').select('*').eq('round_id', round.id),
      supabase.from('votes').select('*').eq('round_id', round.id),
    ]);
    if (g !== gen.current) return;
    setLoaded(true);
    setNotes(n.data ?? []);
    setPlacements(p.data ?? []);
    setVotes(v.data ?? []);
  }, [round.id]);

  useEffect(() => {
    load();
  }, [load]);

  const canPlace = round.step === 'placement' || round.step === 'compare';
  const mine = placements.filter((p) => p.member_id === me);
  const placedIds = new Set(mine.map((p) => p.note_id));
  const unplaced = notes.filter((n) => !placedIds.has(n.id));
  const myVotes = votes.filter((v) => v.member_id === me);

  async function place(x: number, y: number) {
    if (!selected || !canPlace) return;
    gen.current++;
    setError('');
    const row = { note_id: selected, member_id: me, round_id: round.id, x: offLine(x), y: offLine(y) };
    // Show the move at once, so the next click works on the new board.
    const same = (p: Placement) => p.note_id === row.note_id && p.member_id === me;
    const before = placements.find(same);
    setPlacements((cur) => [...cur.filter((p) => !same(p)), row]);
    setSelected(null);
    const { error } = await supabase.from('placements').upsert(row, { onConflict: 'note_id,member_id' });
    if (error) {
      setError(error.message);
      // Undo only this move. Other moves may still be saving.
      setPlacements((cur) => [...cur.filter((p) => !same(p)), ...(before ? [before] : [])]);
    }
  }

  async function toggleVote(noteId: string) {
    gen.current++;
    if (voting) return;
    setVoting(true);
    setError('');
    const has = myVotes.some((v) => v.note_id === noteId);
    const { error } = has
      ? await supabase.from('votes').delete().eq('note_id', noteId).eq('member_id', me)
      : await supabase.from('votes').insert({ note_id: noteId, member_id: me, round_id: round.id });
    if (error) setError(error.message);
    await load();
    setVoting(false);
  }

  const people = members.filter((m) => placements.some((p) => p.member_id === m.id) || m.id === me);
  const shown = viewing === me ? mine : placements.filter((p) => p.member_id === viewing);

  return (
    <section data-testid="board-step">
      {round.step === 'placement' && (
        <p>Place each note on your own board. No other person can see your board in this step.</p>
      )}
      {round.step === 'compare' && <p>Compare the boards. Then you can change your own board one time before the vote.</p>}
      {round.step === 'vote' && <p>Vote for the notes the group must answer first. You can look at each board.</p>}

      {round.step === 'vote' && (
        <label className="no-print">
          Board of{' '}
          <select data-testid="view-board" value={viewing} onChange={(e) => setViewing(e.target.value)}>
            {people.map((m) => (
              <option key={m.id} value={m.id}>{m.id === me ? `${m.display_name} (you)` : m.display_name}</option>
            ))}
          </select>
        </label>
      )}

      {!loaded && <p>Loading…</p>}
      {loaded && <div className="board-layout">
        <Board
          notes={notes}
          placements={shown}
          selected={viewing === me ? selected : null}
          onSelect={viewing === me && canPlace ? setSelected : undefined}
          onPlace={viewing === me && canPlace ? place : undefined}
        />
        {canPlace && (
          <div className="tray" data-testid="tray">
            <p data-testid="placed-count">Placed {mine.length} of {notes.length}</p>
            {unplaced.length > 0 && <p>Select a note, then click the board to place it.</p>}
            {selected && <p>Click the board to place the selected note.</p>}
            <ul>
              {unplaced.map((n) => (
                <li key={n.id}>
                  <button
                    className={`note ${selected === n.id ? 'selected' : ''}`}
                    data-testid="tray-note"
                    onClick={() => setSelected(n.id)}
                  >
                    {n.body}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>}
      {error && <p className="error">{error}</p>}

      {(round.step === 'compare' || round.step === 'vote') && (
        <CompareTable notes={notes} placements={placements} members={members} />
      )}

      {round.step === 'vote' && (
        <section data-testid="vote">
          <h3>Vote</h3>
          <p data-testid="votes-left">You have {VOTES - myVotes.length} of {VOTES} votes left.</p>
          <ul>
            {notes.map((n) => {
              const has = myVotes.some((v) => v.note_id === n.id);
              return (
                <li key={n.id} data-testid="vote-row">
                  <span>{n.body}</span>{' '}
                  <button
                    disabled={voting || (!has && myVotes.length >= VOTES)}
                    onClick={() => toggleVote(n.id)}
                  >
                    {has ? 'Remove my vote' : 'Vote'}
                  </button>
                </li>
              );
            })}
          </ul>
          <p>The counts show when the lead closes the vote.</p>
        </section>
      )}
    </section>
  );
}

export function Board({
  notes,
  placements,
  selected,
  onSelect,
  onPlace,
}: {
  notes: Note[];
  placements: Placement[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onPlace?: (x: number, y: number) => void;
}) {
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  return (
    <div className="board-wrap">
      <div className="axis-y"><span>More important</span><span>Less important</span></div>
      <div>
        <div
          className={`board ${onPlace ? 'editable' : ''}`}
          data-testid="board"
          onClick={(e) => {
            if (!onPlace) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPlace((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
          }}
        >
          <div className="line-v" />
          <div className="line-h" />
          {placements.map((p) => {
            const n = byId.get(p.note_id);
            if (!n) return null;
            return (
              <button
                key={p.note_id + p.member_id}
                className={`note placed ${selected === p.note_id ? 'selected' : ''}`}
                data-testid="placed-note"
                data-quadrant={quadrant(p)}
                style={{ left: `${p.x * 100}%`, top: `${(1 - p.y) * 100}%` }}
                title={n.body}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(p.note_id);
                }}
              >
                {n.body}
              </button>
            );
          })}
        </div>
        <div className="axis-x"><span>Harder</span><span>Easier</span></div>
      </div>
    </div>
  );
}

// Each person's quadrant for each note. The notes that people put in
// different quadrants come first.
export function CompareTable({ notes, placements, members }: { notes: Note[]; placements: Placement[]; members: Member[] }) {
  const people = members.filter((m) => placements.some((p) => p.member_id === m.id));
  const rows = notes
    .map((n) => {
      const cells = people.map((m) => placements.find((p) => p.note_id === n.id && p.member_id === m.id));
      const quads = new Set(cells.filter(Boolean).map((p) => quadrant(p!)));
      return { n, cells, differ: quads.size > 1 };
    })
    .sort((a, b) => Number(b.differ) - Number(a.differ));

  return (
    <section data-testid="compare">
      <h3>Where each person put each note</h3>
      <table>
        <thead>
          <tr>
            <th>Note</th>
            {people.map((m) => (
              <th key={m.id}>{m.display_name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ n, cells, differ }) => (
            <tr key={n.id} data-testid="compare-row" data-differ={differ}>
              <td>
                {n.body}
                {differ && <strong className="differ"> Different quadrants</strong>}
              </td>
              {cells.map((p, i) => (
                <td key={people[i].id}>{p ? quadrant(p) : 'Not placed'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
