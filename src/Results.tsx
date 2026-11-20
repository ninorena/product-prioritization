import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Member, Note, Placement, Round, Vote } from './types';
import { Board, CompareTable } from './BoardStep';
import { StatusSelect, TopicForm } from './NoteControls';

export const TIE_TEXT = 'Which one do you know less about?';

export function Results({ round, members, version, onChange }: { round: Round; members: Member[]; version: number; onChange: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [n, p, v] = await Promise.all([
        supabase.from('notes').select('*').eq('round_id', round.id).order('created_at'),
        supabase.from('placements').select('*').eq('round_id', round.id),
        supabase.from('votes').select('*').eq('round_id', round.id),
      ]);
      if (!live) return;
      setNotes(n.data ?? []);
      setPlacements(p.data ?? []);
      setVotes(v.data ?? []);
    })();
    return () => { live = false; };
  }, [round.id, version]);

  const countOf = (id: string) => votes.filter((v) => v.note_id === id).length;
  // Notes moved off the board (job 10) leave this table.
  const counted = notes
    .filter((n) => !n.status)
    .map((n) => ({ n, count: countOf(n.id) }))
    .sort((a, b) => b.count - a.count);
  const top = counted[0]?.count ?? 0;
  const tie = top > 0 && counted.filter((c) => c.count === top).length > 1;

  // Job 11: the votes for each topic.
  const topics = [...new Set(notes.map((n) => n.topic).filter((t): t is string => !!t))]
    .map((t) => {
      const ns = notes.filter((n) => n.topic === t);
      return { t, notes: ns.length, votes: ns.reduce((sum, n) => sum + countOf(n.id), 0) };
    })
    .sort((a, b) => b.votes - a.votes);

  const people = members.filter((m) => placements.some((p) => p.member_id === m.id));

  return (
    <section data-testid="results">
      <div className="bar">
        <h2>Result of the vote</h2>
        <button className="no-print" onClick={() => window.print()}>Export as PDF</button>
      </div>
      <p className="print-only">Round started {new Date(round.created_at).toLocaleDateString()}. Printed {new Date().toLocaleDateString()}.</p>
      {tie && <p className="tie" data-testid="tie">{TIE_TEXT}</p>}
      <table>
        <thead>
          <tr><th>Note</th><th>Votes</th><th>Topic</th></tr>
        </thead>
        <tbody>
          {counted.map(({ n, count }) => (
            <tr key={n.id} data-testid="result-row" data-count={count}>
              <td>
                {n.body} <StatusSelect note={n} onChange={onChange} />
              </td>
              <td>{count}</td>
              <td><TopicForm key={n.id + (n.topic ?? '')} note={n} onChange={onChange} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {topics.length > 0 && (
        <section data-testid="topics">
          <h3>Votes for each topic</h3>
          <table>
            <thead>
              <tr><th>Topic</th><th>Notes</th><th>Votes</th></tr>
            </thead>
            <tbody>
              {topics.map(({ t, notes, votes }) => (
                <tr key={t} data-testid="topic-row" data-topic={t} data-notes={notes} data-votes={votes}>
                  <td>{t}</td><td>{notes}</td><td>{votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <CompareTable notes={notes} placements={placements} members={members} />

      {people.length > 0 && (
        <section data-testid="result-boards">
          <h3>Each person's board</h3>
          <div className="result-boards">
            {people.map((m) => (
              <div key={m.id} className="result-board">
                <h4>{m.display_name}</h4>
                <Board notes={notes} placements={placements.filter((p) => p.member_id === m.id)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
