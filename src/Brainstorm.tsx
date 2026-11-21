import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { PROMPTS } from './prompts';
import type { Note, Round } from './types';

// Version 2: each person writes question notes straight onto their own
// canvas, with the prompts beside it. There is no response step.
export function Brainstorm({ workspaceId, round, me }: { workspaceId: string; round: Round; me: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState('');
  // The new note that is open for typing and not saved yet.
  const [adding, setAdding] = useState(false);
  // The saved note that is open for edits.
  const [editing, setEditing] = useState<string | null>(null);

  // Each load and each change takes a number. A load applies its result
  // only if nothing started after it, so a slow load cannot undo a change.
  const gen = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const g = ++gen.current;
    const { data } = await supabase
      .from('notes').select('*').eq('round_id', round.id).eq('member_id', me).order('created_at');
    if (g !== gen.current) return;
    setLoaded(true);
    setNotes(data ?? []);
  }, [round.id, me]);

  useEffect(() => {
    load();
  }, [load]);

  async function addNote(text: string): Promise<boolean> {
    gen.current++;
    setError('');
    const { data, error } = await supabase
      .from('notes')
      .insert({ workspace_id: workspaceId, round_id: round.id, member_id: me, body: text })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return false;
    }
    // Add only the new note. A full reload here could undo a change the
    // person made while the save ran.
    setNotes((cur) => [...cur, data as Note]);
    return true;
  }

  async function editNote(n: Note, text: string): Promise<boolean> {
    gen.current++;
    setError('');
    setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, body: text } : x)));
    const { error } = await supabase.from('notes').update({ body: text }).eq('id', n.id);
    if (error) {
      setError(error.message);
      setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, body: n.body } : x)));
      return false;
    }
    return true;
  }

  async function removeNote(n: Note) {
    gen.current++;
    setNotes((cur) => cur.filter((x) => x.id !== n.id));
    const { error } = await supabase.from('notes').delete().eq('id', n.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  return (
    <section data-testid="brainstorm">
      <h2>Brainstorm</h2>
      <p>Write one question on each note. Only you can see your notes until the lead closes the brainstorm.</p>
      <div className="canvas-layout">
        <div className="canvas" data-testid="canvas">
          {!loaded && <p>Loading…</p>}
          {loaded && (
            <div className="note-grid">
              {notes.map((n) =>
                editing === n.id ? (
                  <StickyEditor
                    key={n.id}
                    initial={n.body}
                    onSave={async (t) => {
                      if (t !== n.body && !(await editNote(n, t))) return false;
                      setEditing(null);
                      return true;
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div key={n.id} className="note sticky" data-testid="my-note">
                    <button className="sticky-text" onClick={() => setEditing(n.id)} title="Change this note">
                      {n.body}
                    </button>
                    <button className="sticky-delete" aria-label="Delete this note" onClick={() => removeNote(n)}>
                      ×
                    </button>
                  </div>
                ),
              )}
              {adding && (
                <StickyEditor
                  initial=""
                  onSave={async (t) => {
                    if (!(await addNote(t))) return false;
                    // Keep the editor open for the next note.
                    return 'again';
                  }}
                  onCancel={() => setAdding(false)}
                />
              )}
              {!adding && (
                <button className="add-note" data-testid="add-note" onClick={() => setAdding(true)}>
                  + Add a note
                </button>
              )}
            </div>
          )}
        </div>
        <aside className="side-panel" data-testid="prompts">
          <h3>Prompts</h3>
          <ul>
            {PROMPTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </aside>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// A sticky note open for typing. Enter saves. Shift+Enter adds a new line.
// Escape, or leaving an empty note, closes it with no save.
function StickyEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => Promise<boolean | 'again'>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // A save from a blur closes a new note's editor. A save from Enter keeps
  // it open for the next note.
  async function save(fromBlur: boolean) {
    const sent = text.trim();
    if (!sent) return onCancel();
    if (saving) return;
    setSaving(true);
    const result = await onSave(sent);
    setSaving(false);
    // On a failed save the text stays, so the person can try again.
    if (result === 'again') {
      if (fromBlur) return onCancel();
      setText((cur) => (cur.trim() === sent ? '' : cur));
      ref.current?.focus();
    }
  }

  return (
    <div className="note sticky editing">
      <textarea
        ref={ref}
        data-testid="note-input"
        aria-label="Question"
        placeholder="How might we…?"
        maxLength={500}
        value={text}
        readOnly={saving}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save(false);
          }
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (!saving) save(true);
        }}
      />
    </div>
  );
}
