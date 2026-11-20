import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Member, Note, Placement, Round, Vote } from './types';
import { CompareTable } from './BoardStep';

export const TIE_TEXT = 'Which one do you know less about?';

export function Results({ round, members }: { round: Round; members: Member[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  useEffect(() => {
    (async () => {
      const [n, p, v] = await Promise.all([
        supabase.from('notes').select('*').eq('round_id', round.id).order('created_at'),
        supabase.from('placements').select('*').eq('round_id', round.id),
        supabase.from('votes').select('*').eq('round_id', round.id),
      ]);
      setNotes(n.data ?? []);
      setPlacements(p.data ?? []);
      setVotes(v.data ?? []);
    })();
  }, [round.id]);

  const counted = notes
    .map((n) => ({ n, count: votes.filter((v) => v.note_id === n.id).length }))
    .sort((a, b) => b.count - a.count);
  const top = counted[0]?.count ?? 0;
  const tie = top > 0 && counted.filter((c) => c.count === top).length > 1;

  return (
    <section data-testid="results">
      <h2>Result of the vote</h2>
      {tie && <p className="tie" data-testid="tie">{TIE_TEXT}</p>}
      <table>
        <thead>
          <tr><th>Note</th><th>Votes</th></tr>
        </thead>
        <tbody>
          {counted.map(({ n, count }) => (
            <tr key={n.id} data-testid="result-row" data-count={count}>
              <td>{n.body}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CompareTable notes={notes} placements={placements} members={members} />
    </section>
  );
}
