import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Member, Note, Placement, Round, Vote } from './types';
import { offLine, quadrant } from './quadrant';

const VOTES = 3;

// One arrow key press moves a note this far. The board is 1 wide and 1 high.
const STEP = 0.05;

export function BoardStep({ round, me, members }: { round: Round; me: string; members: Member[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // The board shown full size. In placement it is always the person's own
  // board. In compare and vote, null shows the small copies of all boards.
  const [open, setOpen] = useState<string | null>(round.step === 'placement' ? me : null);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState(false);
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null);
  // The note that gets keyboard focus after a keyboard user puts it on the board.
  const [focusId, setFocusId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

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

  // In placement, show the tray and the full board on one screen.
  useEffect(() => {
    if (loaded && round.step === 'placement') layoutRef.current?.scrollIntoView({ block: 'start' });
  }, [loaded, round.step]);

  // Escape goes back from one full-size board to all the boards.
  useEffect(() => {
    if (round.step === 'placement' || open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, round.step]);

  const canPlace = round.step === 'placement' || round.step === 'compare';
  const editing = canPlace && open === me;
  const mine = placements.filter((p) => p.member_id === me);
  const placedIds = new Set(mine.map((p) => p.note_id));
  const unplaced = notes.filter((n) => !placedIds.has(n.id));
  const myVotes = votes.filter((v) => v.member_id === me);
  const people = members.filter((m) => placements.some((p) => p.member_id === m.id));

  async function place(noteId: string, x: number, y: number) {
    if (!canPlace) return;
    gen.current++;
    setError('');
    const row = { note_id: noteId, member_id: me, round_id: round.id, x: offLine(x), y: offLine(y) };
    // Show the move at once, so the next move works on the new board.
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

  // Drag a note from the tray, or a note on the board, to a place on the
  // board. Pointer events work for a mouse and for a touch screen. A press
  // with no move is a click, and the click selects the note.
  function startDrag(e: React.PointerEvent, id: string) {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!moved) setSelected(null);
      moved = true;
      setGhost({ id, x: ev.clientX, y: ev.clientY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      setGhost(null);
    };
    const up = (ev: PointerEvent) => {
      stop();
      const r = boardRef.current?.getBoundingClientRect();
      if (!moved || !r) return;
      const x = (ev.clientX - r.left) / r.width;
      const y = 1 - (ev.clientY - r.top) / r.height;
      if (x > 0 && x < 1 && y > 0 && y < 1) place(id, x, y);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
  }

  // Keyboard: the arrow keys move a note that has focus on the board.
  function moveByKey(e: React.KeyboardEvent, id: string) {
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP],
    };
    const delta = d[e.key];
    const p = mine.find((x) => x.note_id === id);
    if (!delta || !p) return;
    e.preventDefault();
    const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));
    place(id, clamp(p.x + delta[0]), clamp(p.y + delta[1]));
  }

  async function changeDot(noteId: string, add: boolean) {
    gen.current++;
    if (voting) return;
    setVoting(true);
    setError('');
    const dot = myVotes.find((v) => v.note_id === noteId);
    const { error } = add
      ? await supabase.from('votes').insert({ note_id: noteId, member_id: me, round_id: round.id })
      : dot
        ? await supabase.from('votes').delete().eq('id', dot.id)
        : { error: null };
    if (error) setError(error.message);
    await load();
    setVoting(false);
  }

  const openName = (id: string) => {
    const m = members.find((x) => x.id === id);
    return id === me ? `${m?.display_name ?? ''} (you)` : (m?.display_name ?? '');
  };
  const ghostNote = ghost && notes.find((n) => n.id === ghost.id);

  return (
    <section data-testid="board-step">
      {round.step === 'placement' && (
        <p>Drag each note onto your own board. No other person can see your board in this step.</p>
      )}
      {round.step === 'compare' && <p>Look at each board. Click a board to see it full size. You can still change your own board.</p>}
      {round.step === 'vote' && <p>Put your 3 dots on the notes the group must answer first. You can put more than one dot on one note.</p>}

      {!loaded && <p>Loading…</p>}

      {loaded && open === null && (
        <SmallBoards people={people} notes={notes} placements={placements} me={me} onOpen={setOpen} />
      )}

      {loaded && open !== null && (
        <>
          {round.step !== 'placement' && (
            <div className="bar no-print">
              <h3 data-testid="open-board">Board of {openName(open)}</h3>
              <button onClick={() => setOpen(null)}>Back to all boards</button>
            </div>
          )}
          <div className="board-layout" ref={layoutRef}>
            {editing && (
              <div className="tray" data-testid="tray">
                <p data-testid="placed-count">Placed {mine.length} of {notes.length}</p>
                {unplaced.length > 0 && <p className="hint">Drag a note onto the board, or click a note and then click the board.</p>}
                <p className="hint sr-hint">With a keyboard: press Enter on a note, then move it with the arrow keys.</p>
                <ul>
                  {unplaced.map((n) => (
                    <li key={n.id}>
                      <button
                        className={`note tray-note draggable ${selected === n.id ? 'selected' : ''}`}
                        data-testid="tray-note"
                        onPointerDown={(e) => startDrag(e, n.id)}
                        onClick={(e) => {
                          // A key press (detail 0) puts the note in the middle
                          // of the board. A mouse click selects it.
                          if (e.detail === 0) {
                            place(n.id, 0.5, 0.5);
                            setFocusId(n.id);
                          } else setSelected(n.id);
                        }}
                      >
                        {n.body}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Board
              notes={notes}
              placements={open === me ? mine : placements.filter((p) => p.member_id === open)}
              selected={editing ? selected : null}
              onSelect={editing ? setSelected : undefined}
              onPlace={editing ? (x, y) => selected && place(selected, x, y) : undefined}
              onStartDrag={editing ? startDrag : undefined}
              onKeyMove={editing ? moveByKey : undefined}
              focusId={focusId}
              boardRef={boardRef}
            />
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}

      {loaded && round.step === 'vote' && (
        <VoteGrid notes={notes} myVotes={myVotes} voting={voting} onChange={changeDot} />
      )}

      {loaded && (round.step === 'compare' || round.step === 'vote') && (
        <details className="no-print">
          <summary>Show as a table</summary>
          <CompareTable notes={notes} placements={placements} members={members} />
        </details>
      )}

      {ghost && ghostNote && (
        <div className="note drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghostNote.body}
        </div>
      )}
    </section>
  );
}

// One small copy of each person's board, side by side. A click opens one full size.
function SmallBoards({
  people,
  notes,
  placements,
  me,
  onOpen,
}: {
  people: Member[];
  notes: Note[];
  placements: Placement[];
  me: string;
  onOpen: (id: string) => void;
}) {
  if (people.length === 0) return <p>No person placed a note.</p>;
  return (
    <div className="small-boards" data-testid="small-boards">
      {people.map((m) => (
        <button key={m.id} className="small-board" data-testid="small-board" onClick={() => onOpen(m.id)}>
          <span className="small-board-name">{m.id === me ? `${m.display_name} (you)` : m.display_name}</span>
          <Board notes={notes} placements={placements.filter((p) => p.member_id === m.id)} small />
        </button>
      ))}
    </div>
  );
}

function VoteGrid({
  notes,
  myVotes,
  voting,
  onChange,
}: {
  notes: Note[];
  myVotes: Vote[];
  voting: boolean;
  onChange: (noteId: string, add: boolean) => void;
}) {
  const left = VOTES - myVotes.length;
  return (
    <section data-testid="vote">
      <h3>Vote</h3>
      <p data-testid="votes-left">You have {left} of {VOTES} dots left.</p>
      <div className="note-grid">
        {notes.map((n) => {
          const dots = myVotes.filter((v) => v.note_id === n.id).length;
          return (
            <div key={n.id} className="note sticky vote-note" data-testid="vote-row" data-dots={dots}>
              <p>{n.body}</p>
              <div className="dots" aria-label={`${dots} of your dots`}>
                {Array.from({ length: dots }, (_, i) => (
                  <span key={i} className="dot" />
                ))}
              </div>
              <div className="dot-buttons">
                <button disabled={voting || left === 0} onClick={() => onChange(n.id, true)}>Add a dot</button>
                <button disabled={voting || dots === 0} onClick={() => onChange(n.id, false)}>Remove a dot</button>
              </div>
            </div>
          );
        })}
      </div>
      <p>The counts show when the lead closes the vote.</p>
    </section>
  );
}

export function Board({
  notes,
  placements,
  selected,
  onSelect,
  onPlace,
  onStartDrag,
  onKeyMove,
  focusId,
  boardRef,
  small = false,
}: {
  notes: Note[];
  placements: Placement[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  onPlace?: (x: number, y: number) => void;
  onStartDrag?: (e: React.PointerEvent, id: string) => void;
  onKeyMove?: (e: React.KeyboardEvent, id: string) => void;
  focusId?: string | null;
  boardRef?: React.RefObject<HTMLDivElement | null>;
  small?: boolean;
}) {
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const placedFocus = focusId && placements.some((p) => p.note_id === focusId) ? focusId : null;
  useEffect(() => {
    if (!placedFocus) return;
    innerRef.current?.querySelector<HTMLElement>(`[data-note-id="${placedFocus}"]`)?.focus();
  }, [placedFocus]);
  return (
    <div className={`board-wrap ${small ? 'small' : ''}`}>
      <div className="axis-y" aria-hidden="true">
        <span className="axis-end">More important</span>
        <span className="axis-line" />
        <span className="axis-end">Less important</span>
      </div>
      <div className="board-col">
        <div
          ref={(el) => {
            innerRef.current = el;
            if (boardRef) boardRef.current = el;
          }}
          className={`board ${onPlace ? 'editable' : ''}`}
          data-testid={small ? 'board-small' : 'board'}
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
            const Tag = small ? 'span' : 'button';
            return (
              <Tag
                key={p.note_id + p.member_id}
                className={`note placed ${onStartDrag ? 'draggable' : ''} ${selected === p.note_id ? 'selected' : ''}`}
                data-testid="placed-note"
                data-quadrant={quadrant(p)}
                data-note-id={p.note_id}
                style={{ left: `${p.x * 100}%`, top: `${(1 - p.y) * 100}%` }}
                title={small ? n.body : undefined}
                onPointerDown={onStartDrag ? (e: React.PointerEvent) => onStartDrag(e, p.note_id) : undefined}
                onKeyDown={onKeyMove ? (e: React.KeyboardEvent) => onKeyMove(e, p.note_id) : undefined}
                aria-label={onKeyMove ? `${n.body}. ${quadrant(p)}. Move with the arrow keys.` : undefined}
                onClick={
                  small
                    ? undefined
                    : (e: React.MouseEvent) => {
                        e.stopPropagation();
                        onSelect?.(p.note_id);
                      }
                }
              >
                {n.body}
              </Tag>
            );
          })}
        </div>
        <div className="axis-x" aria-hidden="true">
          <span className="axis-end">Harder</span>
          <span className="axis-line" />
          <span className="axis-end">Easier</span>
        </div>
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
