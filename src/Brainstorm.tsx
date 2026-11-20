import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { PROMPTS } from './prompts';
import type { Note, Response, Round } from './types';

export function Brainstorm({ workspaceId, round, me }: { workspaceId: string; round: Round; me: string }) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [prompt, setPrompt] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Each load and each change takes a number. A load applies its result
  // only if nothing started after it, so a slow load cannot undo a change.
  const gen = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const g = ++gen.current;
    const [r, n] = await Promise.all([
      supabase.from('responses').select('*').eq('workspace_id', workspaceId).eq('member_id', me).order('created_at'),
      supabase.from('notes').select('*').eq('round_id', round.id).eq('member_id', me).order('created_at'),
    ]);
    if (g !== gen.current) return;
    setLoaded(true);
    setResponses(r.data ?? []);
    setNotes(n.data ?? []);
  }, [workspaceId, round.id, me]);

  useEffect(() => {
    load();
  }, [load]);

  async function addResponse(e: React.FormEvent) {
    e.preventDefault();
    gen.current++;
    setError('');
    setSaving(true);
    const { data, error } = await supabase
      .from('responses')
      .insert({ workspace_id: workspaceId, member_id: me, prompt: prompt || null, body })
      .select()
      .single();
    setSaving(false);
    if (error) return setError(error.message);
    setResponses((cur) => [...cur, data as Response]);
    // Keep any text the person typed while the save ran.
    setBody((cur) => (cur === data.body ? '' : cur));
  }

  async function setUnknown(r: Response, value: boolean) {
    gen.current++;
    setResponses((cur) => cur.map((x) => (x.id === r.id ? { ...x, question_unknown: value } : x)));
    const { error } = await supabase.from('responses').update({ question_unknown: value }).eq('id', r.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function addNote(r: Response, text: string) {
    gen.current++;
    setError('');
    const { data, error } = await supabase
      .from('notes')
      .insert({ workspace_id: workspaceId, round_id: round.id, member_id: me, response_id: r.id, body: text })
      .select()
      .single();
    if (error) return setError(error.message);
    // Add only the new note. A full reload here could undo a change the
    // person made while the save ran.
    setNotes((cur) => [...cur, data as Note]);
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
      <p>Write responses to the prompts. Then turn each response into one or more questions. Only you can read your responses and notes until the lead closes the brainstorm.</p>
      <h3>Prompts</h3>
      <ul data-testid="prompts">
        {PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      {!loaded && <p>Loading…</p>}
      {loaded && <>
      <form onSubmit={addResponse} data-testid="response-form">
        <h3>Write a response</h3>
        <label>
          Prompt
          <select value={prompt} onChange={(e) => setPrompt(e.target.value)}>
            <option value="">No prompt</option>
            {PROMPTS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Response <textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </label>
        <button type="submit" disabled={saving}>Save the response</button>
      </form>
      {error && <p className="error">{error}</p>}

      <h3>Your responses</h3>
      {responses.length === 0 && <p>No response yet.</p>}
      <ul className="responses">
        {responses.map((r) => (
          <li key={r.id} data-testid="response">
            {r.prompt && <small>{r.prompt}</small>}
            <p className="response-body">{r.body}</p>
            <label>
              <input
                type="checkbox"
                checked={r.question_unknown}
                onChange={(e) => setUnknown(r, e.target.checked)}
              />{' '}
              Question not known
            </label>
            <ul className="notes">
              {notes
                .filter((n) => n.response_id === r.id)
                .map((n) => (
                  <li key={n.id} data-testid="my-note">
                    {n.body} <button onClick={() => removeNote(n)}>Delete</button>
                  </li>
                ))}
            </ul>
            {!r.question_unknown && <NoteForm onAdd={(t) => addNote(r, t)} />}
          </li>
        ))}
      </ul>
      </>}
    </section>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const sent = text;
        await onAdd(sent);
        // Keep any text the person typed while the save ran.
        setText((cur) => (cur === sent ? '' : cur));
      }}
    >
      <label>
        Question <input required value={text} onChange={(e) => setText(e.target.value)} placeholder="How might we…?" />
      </label>
      <button type="submit">Add the note</button>
    </form>
  );
}
