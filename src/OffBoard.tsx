import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Note, NoteStatus } from './types';
import { STATUS_LABEL } from './types';
import { StatusSelect } from './NoteControls';

const ORDER: NoteStatus[] = ['in_progress', 'icebox', 'closed'];

// The notes that people moved off the board, from every round in the
// workspace, so the list stays in use for the full project (job 10).
export function OffBoard({ workspaceId, latestRound, version, onChange }: { workspaceId: string; latestRound: string | null; version: number; onChange: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let live = true;
    supabase
      .from('notes').select('*').eq('workspace_id', workspaceId).not('status', 'is', null).order('created_at')
      .then(({ data }) => { if (live) setNotes(data ?? []); });
    return () => { live = false; };
  }, [workspaceId, version]);

  if (notes.length === 0) return null;
  return (
    <section data-testid="off-board">
      <h2>Notes off the board</h2>
      {ORDER.filter((st) => notes.some((n) => n.status === st)).map((st) => (
        <div key={st}>
          <h3>{STATUS_LABEL[st]}</h3>
          <ul>
            {notes.filter((n) => n.status === st).map((n) => (
              <li key={n.id} data-testid="off-board-note" data-status={n.status}>
                {n.body}
                {n.topic && <small className="topic"> {n.topic}</small>}{' '}
                <StatusSelect note={n} onChange={onChange} allowBoard={n.round_id === latestRound} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
