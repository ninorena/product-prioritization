// Test helpers. Every text here is invented. Real client text never goes
// into a test.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) throw new Error('run `npm test`, which writes .env.test.local first');

export const TEST_LEAD = 'test-lead@example.test';
const TEST_LEAD_PASSWORD = `pw-${SERVICE.slice(-12)}`;
const REF = new globalThis.URL(URL).hostname.split('.')[0];
const STORAGE_KEY = `sb-${REF}-auth-token`;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(URL, SERVICE, opts);
export const newClient = () => createClient(URL, ANON, opts);

let leadReady: Promise<void> | null = null;
function ensureLead() {
  leadReady ??= (async () => {
    const { error } = await admin.auth.admin.createUser({
      email: TEST_LEAD, password: TEST_LEAD_PASSWORD, email_confirm: true,
    });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
  })();
  return leadReady;
}

// One sign-in for each test worker: Supabase limits sign-ins to 150 in
// 5 minutes from one address.
let leadSignIn: Promise<{ client: SupabaseClient; session: Session }> | null = null;
export function leadClient() {
  leadSignIn ??= (async () => {
    await ensureLead();
    const c = newClient();
    const { data, error } = await c.auth.signInWithPassword({ email: TEST_LEAD, password: TEST_LEAD_PASSWORD });
    if (error) throw error;
    return { client: c, session: data.session! };
  })();
  return leadSignIn;
}

// A member's session, as a second device would get it: sign in as an
// anonymous user, then claim the token.
export async function memberClient(token: string) {
  const c = newClient();
  const { error } = await c.auth.signInAnonymously();
  if (error) throw error;
  const claim = await c.rpc('claim_link', { p_token: token });
  return { client: c, workspace: claim.data as string | null };
}

export async function call<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(JSON.stringify(error));
  return data;
}

export interface Seed {
  workspace: string;
  round: string;
  lead: SupabaseClient;
  leadMember: string;
  members: { name: string; id: string; token: string; client: SupabaseClient }[];
}

// Makes a workspace with the given members and starts a round, through the API.
// With { round: false } it makes no round, and `round` is ''.
export async function seed(names: string[], opts: { round?: boolean } = {}): Promise<Seed> {
  const { client: lead } = await leadClient();
  const workspace = await call(lead.rpc('create_workspace', { p_name: `Test client ${Date.now()}`, p_lead_name: 'Lena Lead' }));
  const members = [];
  for (const name of names) {
    const [row] = await call(lead.rpc('add_member', { p_workspace: workspace, p_name: name })) as { member_id: string; token: string }[];
    const { client } = await memberClient(row.token);
    members.push({ name, id: row.member_id, token: row.token, client });
  }
  const leadMember = await call(lead.rpc('my_member', { p_workspace: workspace })) as string;
  const round = opts.round === false ? '' : await call(lead.rpc('start_round', { p_workspace: workspace })) as string;
  return { workspace: workspace as string, round, lead, leadMember, members };
}

export async function addNote(s: Seed, who: number, body: string) {
  const m = s.members[who];
  const [row] = await call(
    m.client.from('notes').insert({ workspace_id: s.workspace, round_id: s.round, member_id: m.id, body }).select(),
  ) as { id: string }[];
  return row.id;
}

export async function place(s: Seed, who: number, noteId: string, x: number, y: number) {
  const m = s.members[who];
  await call(m.client.from('placements').upsert({ note_id: noteId, member_id: m.id, round_id: s.round, x, y }).select());
}

export async function addResponse(s: Seed, who: number, body: string) {
  const m = s.members[who];
  const [row] = await call(
    m.client.from('responses').insert({ workspace_id: s.workspace, member_id: m.id, body }).select(),
  ) as { id: string }[];
  return row.id;
}

export async function vote(s: Seed, who: number, noteId: string) {
  const m = s.members[who];
  await call(m.client.from('votes').insert({ note_id: noteId, member_id: m.id, round_id: s.round }).select());
}

export async function advance(s: Seed, times = 1) {
  for (let i = 0; i < times; i++) {
    const [r] = await call(s.lead.from('rounds').select('step').eq('id', s.round)) as { step: string }[];
    await call(s.lead.rpc('advance_round', { p_round: s.round, p_from: r.step }));
  }
}

// A browser for the lead, signed in without email.
export async function leadPage(browser: Browser): Promise<Page> {
  const { session } = await leadClient();
  const ctx = await browser.newContext();
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)]);
  return ctx.newPage();
}

// A browser for a member: opens the private link.
export async function memberPage(browser: Browser, token: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/#/j/${token}`);
  await expect(page.getByTestId('workspace')).toBeVisible();
  return page;
}

export async function stepIs(page: Page, step: string) {
  await page.reload();
  await expect(page.getByTestId('round-step')).toHaveAttribute('data-step', step);
}

// Clicks the board at a position. x: 0 Harder, 1 Easier. y: 0 Less, 1 More important.
export async function clickBoard(page: Page, x: number, y: number) {
  const board = page.getByTestId('board');
  const box = (await board.boundingBox())!;
  await board.click({ position: { x: x * box.width, y: (1 - y) * box.height } });
}
