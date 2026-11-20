// Runs the migrations on an in-memory Postgres with a stub of Supabase's
// auth schema, then plays one round as three users and checks RLS.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? new URL("../../supabase/migrations", import.meta.url).pathname;
const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth;
grant usage on schema extensions to public;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, is_anonymous boolean default false);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`);
await db.exec(`create extension pgcrypto with schema extensions;`);

for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
    console.log('applied', f);
  } catch (e) {
    console.error('FAILED', f, e.message);
    process.exit(1);
  }
}

const U = {
  lead: '00000000-0000-0000-0000-00000000000a',
  a: '00000000-0000-0000-0000-00000000000b',
  b: '00000000-0000-0000-0000-00000000000c',
  a2: '00000000-0000-0000-0000-00000000000d',
};
await db.exec(`insert into auth.users values
 ('${U.lead}','lead@example.test',false),('${U.a}',null,true),('${U.b}',null,true),('${U.a2}',null,true);
 insert into private.leads values ('lead@example.test');`);

async function as(user, sql, params = []) {
  const claims = user === 'lead'
    ? { sub: U.lead, email: 'lead@example.test', is_anonymous: false, role: 'authenticated' }
    : { sub: U[user], is_anonymous: true, role: 'authenticated' };
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); set role authenticated;`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}
let fails = 0;
function expect(name, cond) {
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}`);
  if (!cond) fails++;
}
async function expectError(name, fn) {
  try { await fn(); expect(name, false); } catch { expect(name, true); }
}

const ws = (await as('lead', `select public.create_workspace('Acme test','Lead') as id`))[0].id;
const ws2 = (await as('lead', `select public.create_workspace('Other test','Lead') as id`))[0].id;
const otherRound = (await as('lead', `select public.start_round($1) as id`, [ws2]))[0].id;
const [ma] = await as('lead', `select * from public.add_member($1,'Ana')`, [ws]);
const [mb] = await as('lead', `select * from public.add_member($1,'Ben')`, [ws]);
await expectError('member cannot make a workspace', () => as('a', `select public.create_workspace('x','y')`));
expect('A sees nothing before claiming', (await as('a', 'select * from public.workspaces')).length === 0);
expect('A claims link', (await as('a', `select public.claim_link($1) as w`, [ma.token]))[0].w === ws);
expect('B claims link', (await as('b', `select public.claim_link($1) as w`, [mb.token]))[0].w === ws);
expect('A2 (second device) claims A link', (await as('a2', `select public.claim_link($1) as w`, [ma.token]))[0].w === ws);
expect('bad token refused', (await as('b', `select public.claim_link('nope') as w`))[0].w === null);
expect('A sees workspace', (await as('a', 'select * from public.workspaces')).length === 1);
expect('A cannot read tokens', await as('a', 'select * from private.member_tokens').then(() => false, () => true));
await expectError('member cannot start round', () => as('a', `select public.start_round($1)`, [ws]));
const round = (await as('lead', `select public.start_round($1) as id`, [ws]))[0].id;
await expectError('second open round refused', () => as('lead', `select public.start_round($1)`, [ws]));

const ra = (await as('a', `insert into public.responses(workspace_id, member_id, body) values ($1,$2,'resp a') returning id`, [ws, ma.member_id]))[0].id;
await expectError('A cannot write response as B', () => as('a', `insert into public.responses(workspace_id, member_id, body) values ($1,$2,'x')`, [ws, mb.member_id]));
expect('B cannot read A responses', (await as('b', 'select * from public.responses')).length === 0);
await expectError('note with a round of another workspace refused', () => as('a', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,$3,'x')`, [ws, otherRound, ma.member_id]));
const na = (await as('a', `insert into public.notes(workspace_id, round_id, member_id, response_id, body) values ($1,$2,$3,$4,'How a?') returning id`, [ws, round, ma.member_id, ra]))[0].id;
const nb = (await as('b', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,$3,'How b?') returning id`, [ws, round, mb.member_id]))[0].id;
expect('B cannot see A note during brainstorm', (await as('b', 'select * from public.notes')).length === 1);
const gone = (await as('a', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,$3,'deleted') returning id`, [ws, round, ma.member_id]))[0].id;
expect('A deletes own note in brainstorm', (await as('a', `delete from public.notes where id=$1 returning id`, [gone])).length === 1);
expect('B cannot delete A note', (await as('b', `delete from public.notes where id=$1 returning id`, [na])).length === 0);
await expectError('placement refused in brainstorm', () => as('a', `insert into public.placements values ($1,$2,$3,0.2,0.8)`, [na, ma.member_id, round]));
await expectError('member cannot advance', () => as('a', `select public.advance_round($1,'brainstorm')`, [round]));
await expectError('advance from a stale step refused', () => as('lead', `select public.advance_round($1,'placement')`, [round]));
expect('lead advances to placement', (await as('lead', `select public.advance_round($1,'brainstorm') as s`, [round]))[0].s === 'placement');
expect('deleted note not in the pool', (await as('b', 'select * from public.notes where id=$1', [gone])).length === 0);
expect('B sees all notes in pool', (await as('b', 'select * from public.notes')).length === 2);
await expectError('note edit refused after brainstorm', () => as('a', `update public.notes set body='x' where id=$1 returning id`, [na]).then((r) => { if (!r.length) throw new Error('0 rows'); }));
await as('a', `insert into public.placements values ($1,$2,$3,0.2,0.8)`, [na, ma.member_id, round]);
await as('a', `insert into public.placements values ($1,$2,$3,0.7,0.7)`, [nb, ma.member_id, round]);
await as('b', `insert into public.placements values ($1,$2,$3,0.8,0.2)`, [na, mb.member_id, round]);
await expectError('placement with a note of another round refused', () => as('a', `insert into public.placements values ($1,$2,$3,0.3,0.3)`, [na, ma.member_id, otherRound]));
await expectError('placement on the line refused', () => as('b', `insert into public.placements values ($1,$2,$3,0.5,0.7)`, [nb, mb.member_id, round]));
await expectError('A cannot place for B', () => as('a', `insert into public.placements values ($1,$2,$3,0.3,0.3)`, [nb, mb.member_id, round]));
expect('A reads zero placements of B in placement step', (await as('a', `select * from public.placements where member_id=$1`, [mb.member_id])).length === 0);
expect('lead reads zero placements of B in placement step', (await as('lead', `select * from public.placements where member_id=$1`, [mb.member_id])).length === 0);
await as('lead', `select public.advance_round($1,'placement')`, [round]);
expect('A reads B placements in compare', (await as('a', `select * from public.placements where member_id=$1`, [mb.member_id])).length === 1);
const upd = await as('b', `update public.placements set x=0.3 where note_id=$1 and member_id=$2 returning x`, [na, mb.member_id]);
expect('B changes own board in compare', upd.length === 1);
await expectError('vote refused before vote step', () => as('a', `insert into public.votes values ($1,$2,$3)`, [na, ma.member_id, round]));
await as('lead', `select public.advance_round($1,'compare')`, [round]);
const upd2 = await as('b', `update public.placements set x=0.9 where note_id=$1 and member_id=$2 returning x`, [na, mb.member_id]);
expect('board frozen in vote', upd2.length === 0);
await as('a', `insert into public.votes values ($1,$2,$3)`, [na, ma.member_id, round]);
await as('a', `insert into public.votes values ($1,$2,$3)`, [nb, ma.member_id, round]);
await as('b', `insert into public.votes values ($1,$2,$3)`, [na, mb.member_id, round]);
expect('A cannot see B votes in vote step', (await as('a', 'select * from public.votes')).length === 2);
expect('A cannot delete B vote', (await as('a', `delete from public.votes where member_id=$1 returning note_id`, [mb.member_id])).length === 0);
expect('A removes own vote', (await as('a', `delete from public.votes where note_id=$1 and member_id=$2 returning note_id`, [nb, ma.member_id])).length === 1);
await as('a', `insert into public.votes values ($1,$2,$3)`, [nb, ma.member_id, round]);
await as('lead', `select public.advance_round($1,'vote')`, [round]);
expect('vote removal refused after close', (await as('a', `delete from public.votes where member_id=$1 returning note_id`, [ma.member_id])).length === 0);
expect('A sees all votes when closed', (await as('a', 'select * from public.votes')).length === 3);
await expectError('vote refused after close', () => as('b', `insert into public.votes values ($1,$2,$3)`, [nb, mb.member_id, round]));

// After the round (jobs 10 and 11): any person moves a note off the board
// and gives it a topic, only through the functions.
await as('b', `select public.set_note_status($1,'icebox')`, [na]);
expect('A reads the status B set', (await as('a', 'select status from public.notes where id=$1', [na]))[0].status === 'icebox');
await as('a', `select public.set_note_status($1,null)`, [na]);
expect('a note goes back on the board', (await as('b', 'select status from public.notes where id=$1', [na]))[0].status === null);
await as('a', `select public.set_note_topic($1,'  Pricing  ')`, [na]);
expect('topic is stored without spaces at the ends', (await as('b', 'select topic from public.notes where id=$1', [na]))[0].topic === 'Pricing');
await as('a', `select public.set_note_topic($1,'')`, [na]);
expect('an empty topic clears it', (await as('b', 'select topic from public.notes where id=$1', [na]))[0].topic === null);
await expectError('topic over 60 characters refused', () => as('a', `select public.set_note_topic($1,$2)`, [na, 'x'.repeat(61)]));
await expectError('direct update of status refused', () => as('a', `update public.notes set status='closed' where id=$1`, [na]));

// Cancel A's link: both of A's sessions lose access.
await as('lead', `select public.cancel_member_link($1)`, [ma.member_id]);
expect('canceled A sees no workspace', (await as('a', 'select * from public.workspaces')).length === 0);
expect('canceled A2 sees no notes', (await as('a2', 'select * from public.notes')).length === 0);
expect('canceled A sees no placements', (await as('a', 'select * from public.placements')).length === 0);
await expectError('canceled A cannot set a status', () => as('a', `select public.set_note_status($1,'closed')`, [nb]));
expect('canceled link refused on claim', (await as('a', `select public.claim_link($1) as w`, [ma.token]))[0].w === null);
const tok2 = (await as('lead', `select public.new_member_link($1) as t`, [ma.member_id]))[0].t;
expect('new link works', (await as('a', `select public.claim_link($1) as w`, [tok2]))[0].w === ws);
expect('B still in', (await as('b', 'select * from public.workspaces')).length === 1);

// Member limit.
for (const n of ['C', 'D', 'E']) await as('lead', `select * from public.add_member($1,$2)`, [ws, n]);
await expectError('sixth member refused', () => as('lead', `select * from public.add_member($1,'F')`, [ws]));

// Votes limit.
const r2 = (await as('lead', `select public.start_round($1) as id`, [ws]))[0].id;
await expectError('direct insert with a status refused in the brainstorm', () => as('b', `insert into public.notes(workspace_id, round_id, member_id, body, status) values ($1,$2,$3,'x','icebox')`, [ws, r2, mb.member_id]));
await expectError('direct insert with a topic refused in the brainstorm', () => as('b', `insert into public.notes(workspace_id, round_id, member_id, body, topic) values ($1,$2,$3,'x','t')`, [ws, r2, mb.member_id]));
expect('a plain insert works in the brainstorm', (await as('b', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,$3,'plain') returning id`, [ws, r2, mb.member_id])).length === 1);
const ids = [];
for (let i = 0; i < 4; i++) ids.push((await as('b', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,$3,'q${i}') returning id`, [ws, r2, mb.member_id]))[0].id);
for (const st of ['brainstorm', 'placement', 'compare']) await as('lead', `select public.advance_round($1,$2)`, [r2, st]);
for (let i = 0; i < 3; i++) await as('b', `insert into public.votes values ($1,$2,$3)`, [ids[i], mb.member_id, r2]);
await expectError('fourth vote refused', () => as('b', `insert into public.votes values ($1,$2,$3)`, [ids[3], mb.member_id, r2]));
await expectError('status refused while the round is open', () => as('b', `select public.set_note_status($1,'icebox')`, [ids[0]]));
await expectError('topic refused while the round is open', () => as('b', `select public.set_note_topic($1,'x')`, [ids[0]]));
const otherNote = (await as('lead', `insert into public.notes(workspace_id, round_id, member_id, body) values ($1,$2,(select public.my_member($1)),'other') returning id`, [ws2, otherRound]))[0].id;
await expectError('status refused for a note of another workspace', () => as('b', `select public.set_note_status($1,'icebox')`, [otherNote]));
await db.exec('reset role;');
await db.exec('set role anon;');
expect('anon role reads nothing', await db.query('select * from public.notes').then(() => false, (e) => /permission denied/.test(e.message)));
await db.exec('reset role; set role anon;');
expect('ping works for anon', (await db.query('select public.ping() as p')).rows[0].p === 1);
await db.exec('reset role;');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
