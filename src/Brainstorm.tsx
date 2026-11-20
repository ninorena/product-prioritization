import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PROMPTS } from './prompts';
import type { Note, Response, Round } from './types';

export function Brainstorm({ workspaceId, round, me }: { workspaceId: string; round: Round; me: string }) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [prompt, setPrompt] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [r, n] = await Promise.all([
      supabase.from('responses').select('*').eq('workspace_id', workspaceId).eq('member_id', me).order('created_at'),
      supabase.from('notes').select('*').eq('round_id', round.id).eq('member_id', me).order('created_at'),
    ]);
    setResponses(r.data ?? []);
    setNotes(n.data ?? []);
  }, [workspaceId, round.id, me]);

  useEffect(() => {
    load();
  }, [load]);

  async function addResponse(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase
      .from('responses')
      .insert({ workspace_id: workspaceId, member_id: me, prompt: prompt || null, body });
    if (error) return setError(error.message);
    setBody('');
    load();
  }

  async function setUnknown(r: Response, value: boolean) {
    await supabase.from('responses').update({ question_unknown: value }).eq('id', r.id);
    load();
  }

  async function addNote(r: Response, text: string) {
    setError('');
    const { error } = await supabase
      .from('notes')
      .insert({ workspace_id: workspaceId, round_id: round.id, member_id: me, response_id: r.id, body: text });
    if (error) return setError(error.message);
    load();
  }

  async function removeNote(n: Note) {
    await supabase.from('notes').delete().eq('id', n.id);
    load();
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
        <button type="submit">Save the response</button>
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
    </section>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onAdd(text);
        setText('');
      }}
    >
      <label>
        Question <input required value={text} onChange={(e) => setText(e.target.value)} placeholder="How might we…?" />
      </label>
      <button type="submit">Add the note</button>
    </form>
  );
}
