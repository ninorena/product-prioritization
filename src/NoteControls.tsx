import { useState } from 'react';
import { supabase } from './supabase';
import type { Note, NoteStatus } from './types';
import { STATUS_LABEL } from './types';

// After a round, any person can move a note off the board (job 10) and give
// it a topic (job 11). Both go through database functions.

export function StatusSelect({ note, onChange }: { note: Note; onChange: () => void }) {
  const [error, setError] = useState('');
  async function set(value: string) {
    setError('');
    const { error } = await supabase.rpc('set_note_status', {
      p_note: note.id,
      p_status: value === 'board' ? null : (value as NoteStatus),
    });
    if (error) setError(error.message);
    onChange();
  }
  return (
    <span className="no-print">
      <label className="inline">
        Status{' '}
        <select value={note.status ?? 'board'} onChange={(e) => set(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </label>
      {error && <span className="error"> {error}</span>}
    </span>
  );
}

export function TopicForm({ note, onChange }: { note: Note; onChange: () => void }) {
  const [text, setText] = useState(note.topic ?? '');
  const [error, setError] = useState('');
  return (
    <span>
      {note.topic && <span className="topic" data-testid="topic-saved">{note.topic}</span>}
      <form
        className="no-print inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const { error } = await supabase.rpc('set_note_topic', { p_note: note.id, p_topic: text });
          if (error) setError(error.message);
          onChange();
        }}
      >
        <label className="inline">
          Topic <input value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit">Save the topic</button>
        {error && <span className="error"> {error}</span>}
      </form>
    </span>
  );
}
