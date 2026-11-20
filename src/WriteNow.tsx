import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Response } from './types';

// Job 1: write a question down at once, also when no brainstorm is open.
// It is a response with no prompt. The next brainstorm shows it.
export function WriteNow({ workspaceId, me }: { workspaceId: string; me: string }) {
  const [saved, setSaved] = useState<Response[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The responses that no note uses yet.
  const load = useCallback(async () => {
    const [r, n] = await Promise.all([
      supabase.from('responses').select('*').eq('workspace_id', workspaceId).eq('member_id', me).order('created_at'),
      supabase.from('notes').select('response_id').eq('workspace_id', workspaceId).eq('member_id', me).not('response_id', 'is', null),
    ]);
    const used = new Set((n.data ?? []).map((x) => x.response_id as string));
    setSaved((r.data ?? []).filter((x) => !used.has(x.id)));
  }, [workspaceId, me]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const { data, error } = await supabase
      .from('responses')
      .insert({ workspace_id: workspaceId, member_id: me, body })
      .select()
      .single();
    setSaving(false);
    if (error) return setError(error.message);
    setSaved((cur) => [...cur, data as Response]);
    setBody((cur) => (cur === data.body ? '' : cur));
  }

  return (
    <section className="no-print" data-testid="write-now">
      <h2>Write a question down</h2>
      <p>A question or a worry about the product came to mind? Write it down now. Only you can read it. It waits for you in the next brainstorm.</p>
      <form onSubmit={save}>
        <label>
          Question or worry <textarea required rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button type="submit" disabled={saving}>Save it for the next brainstorm</button>
      </form>
      {error && <p className="error">{error}</p>}
      {saved.length > 0 && (
        <>
          <h3>Saved for the next brainstorm</h3>
          <ul>
            {saved.map((r) => (
              <li key={r.id} data-testid="saved-response">{r.body}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
