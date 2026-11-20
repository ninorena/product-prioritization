import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './supabase';
import type { Workspace } from './types';
import { WorkspaceView } from './WorkspaceView';

type Route = { kind: 'home' } | { kind: 'join'; token: string } | { kind: 'workspace'; id: string };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'j' && b) return { kind: 'join', token: b };
  if (a === 'w' && b) return { kind: 'workspace', id: b };
  return { kind: 'home' };
}

export function go(path: string, replace = false) {
  const url = `${window.location.pathname}#${path}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
      data.subscription.unsubscribe();
    };
  }, []);

  if (!configured) return <main><p>The app has no Supabase settings.</p></main>;
  if (route.kind === 'join') return <Join token={route.token} />;
  if (session === undefined) return <main><p>Loading…</p></main>;
  if (!session) return <SignIn />;
  if (route.kind === 'workspace') return <WorkspaceView id={route.id} session={session} />;
  return <Home session={session} />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main data-testid="sign-in">
      <h1>Product prioritization</h1>
      <p>Members: open the private link that the lead sent you.</p>
      <h2>Lead sign-in</h2>
      {sent ? (
        <p>Check your email for the sign-in link.</p>
      ) : (
        <form onSubmit={send}>
          <label>
            Email <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit">Send me a sign-in link</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Join({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'refused' | 'lead' | 'busy'>('working');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let { data } = await supabase.auth.getSession();
      if (data.session && !data.session.user.is_anonymous) {
        setState('lead');
        return;
      }
      if (!data.session) {
        const res = await supabase.auth.signInAnonymously();
        if (res.error) {
          // Supabase limits sign-ins from one address. The link may still be good.
          setState('busy');
          return;
        }
      }
      const { data: ws, error } = await supabase.rpc('claim_link', { p_token: token });
      if (error || !ws) {
        setState('refused');
        return;
      }
      // The token leaves the address bar and the history.
      go(`/w/${ws}`, true);
    })();
  }, [token]);

  if (state === 'lead')
    return (
      <main>
        <p>You are signed in as the lead. Open this member link in a private window.</p>
      </main>
    );
  if (state === 'busy')
    return (
      <main data-testid="sign-in-busy">
        <h1>Sign-in is busy</h1>
        <p>Too many people signed in from this network in the last hour. Try the same link again later.</p>
      </main>
    );
  if (state === 'refused')
    return (
      <main data-testid="link-refused">
        <h1>This link does not work</h1>
        <p>The lead canceled it or made a new one. Ask the lead for a new link.</p>
      </main>
    );
  return <main><p>Opening your workspace…</p></main>;
}

function Home({ session }: { session: Session }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLead, setIsLead] = useState(false);
  const [name, setName] = useState('');
  const [leadName, setLeadName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await supabase.from('workspaces').select('*').order('created_at');
    setWorkspaces(data ?? []);
    const lead = await supabase.rpc('am_i_lead');
    setIsLead(Boolean(lead.data));
  }
  useEffect(() => {
    load();
  }, [session.user.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { data, error } = await supabase.rpc('create_workspace', { p_name: name, p_lead_name: leadName });
    if (error) setError(error.message);
    else go(`/w/${data}`);
  }

  return (
    <main data-testid="home">
      <header className="bar">
        <h1>Product prioritization</h1>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <h2>Workspaces</h2>
      {workspaces.length === 0 && <p>No workspace yet.</p>}
      <ul>
        {workspaces.map((w) => (
          <li key={w.id}>
            <a href={`#/w/${w.id}`}>{w.name}</a>
          </li>
        ))}
      </ul>
      {isLead && (
        <form onSubmit={create} data-testid="new-workspace">
          <h2>New workspace</h2>
          <label>
            Client name <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Your name <input required value={leadName} onChange={(e) => setLeadName(e.target.value)} />
          </label>
          <button type="submit">Make the workspace</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
