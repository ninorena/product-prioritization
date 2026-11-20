#!/usr/bin/env node
// Talks to the Supabase Management API with the token in .env.
// It never prints a key.
//
//   node scripts/sb.mjs check <test|prod>      say which settings are present
//   node scripts/sb.mjs keys <test|prod>       write .env.<target>.local for Vite and the tests
//   node scripts/sb.mjs migrate <test|prod>    apply new files in supabase/migrations
//   node scripts/sb.mjs configure <test|prod>  set the auth settings the app needs
//   node scripts/sb.mjs lead <test|prod>       let LEAD_EMAIL make workspaces
//   node scripts/sb.mjs setup <test|prod>      migrate, configure and lead, in that order
//   node scripts/sb.mjs clean test             delete the data the tests made

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const API = 'https://api.supabase.com/v1';
const TEST_LEAD = 'test-lead@example.test';
const SITE = {
  test: 'http://localhost:5173',
  prod: 'https://tools.peoplepurposeproduct.com',
};

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function refFor(target) {
  const name = target === 'prod' ? 'SUPABASE_PROD_REF' : 'SUPABASE_TEST_REF';
  const ref = process.env[name];
  if (!ref) fail(`${name} is missing from .env`);
  return ref;
}

async function api(method, path, body) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) fail('SUPABASE_ACCESS_TOKEN is missing from .env');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${path.replace(/\/projects\/[^/]+/, '/projects/<ref>')} returned HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const sql = (ref, query) => api('POST', `/projects/${ref}/database/query`, { query });

async function keys(ref) {
  const list = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
  const pick = (names) => list.find((k) => names.includes(k.name) || names.includes(k.type))?.api_key;
  const anon = pick(['anon', 'publishable']);
  const service = pick(['service_role', 'secret']);
  if (!anon || !service) fail('the project has no anon or service key');
  return { anon, service };
}

const commands = {
  async check(target) {
    for (const n of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_TEST_REF', 'SUPABASE_PROD_REF', 'LEAD_EMAIL']) {
      console.log(`${n}: ${process.env[n] ? 'set' : 'MISSING'}`);
    }
    const ref = refFor(target);
    const projects = await api('GET', '/projects');
    const p = projects.find((x) => x.id === ref || x.ref === ref);
    console.log(`project ${target}: ${p ? `found, name "${p.name}", status ${p.status}` : 'NOT FOUND for this token'}`);
  },

  async keys(target) {
    const ref = refFor(target);
    const k = await keys(ref);
    const file = join(root, `.env.${target}.local`);
    const lines = [
      `VITE_SUPABASE_URL=https://${ref}.supabase.co`,
      `VITE_SUPABASE_ANON_KEY=${k.anon}`,
    ];
    if (target === 'test') lines.push(`SUPABASE_SERVICE_ROLE_KEY=${k.service}`);
    writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
    console.log(`wrote .env.${target}.local (keys not shown)`);
  },

  async migrate(target) {
    const ref = refFor(target);
    await sql(ref, `create schema if not exists ops;
      create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now());
      revoke all on schema ops from public, anon, authenticated;`);
    const done = new Set((await sql(ref, 'select name from ops.migrations')).map((r) => r.name));
    const dir = join(root, 'supabase', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const body = readFileSync(join(dir, f), 'utf8');
      const name = f.replace(/'/g, "''");
      await sql(ref, `begin;\n${body}\ninsert into ops.migrations(name) values ('${name}');\ncommit;`);
      console.log(`applied ${f}`);
    }
    console.log(`migrations up to date on ${target}`);
  },

  async configure(target) {
    const ref = refFor(target);
    const site = SITE[target];
    await api('PATCH', `/projects/${ref}/config/auth`, {
      site_url: site,
      uri_allow_list: target === 'test' ? `${site}/**,http://127.0.0.1:5173/**` : `${site}/**`,
      external_anonymous_users_enabled: true,
      // The test suite signs in many anonymous users from one address.
      ...(target === 'test' ? { rate_limit_anonymous_users: 1000 } : {}),
    });
    console.log(`auth configured on ${target}: anonymous sign-in on, site ${site}`);
  },

  async lead(target) {
    const ref = refFor(target);
    const email = process.env.LEAD_EMAIL;
    if (!email) fail('LEAD_EMAIL is missing from .env');
    const safe = email.toLowerCase().replace(/'/g, "''");
    await sql(ref, `insert into private.leads(email) values ('${safe}') on conflict do nothing;`);
    if (target === 'test') {
      // The invented lead that the Playwright tests sign in as.
      await sql(ref, `insert into private.leads(email) values ('${TEST_LEAD}') on conflict do nothing;`);
    }
    console.log(`lead added on ${target} (email not shown)`);
  },

  // Deletes what the tests made: the test lead's workspaces, then each
  // anonymous user that is no longer a member anywhere. Runs only on the
  // test project, and keeps the sessions of a round that a person runs by hand.
  async clean(target) {
    if (target !== 'test') fail('clean runs only on the test project');
    const ref = refFor(target);
    await sql(ref, `delete from public.workspaces w using auth.users u
      where w.owner_id = u.id and u.email = '${TEST_LEAD}';
      delete from auth.users u where u.is_anonymous is true
        and not exists (select 1 from private.member_sessions s where s.user_id = u.id);`);
    console.log('test data deleted');
  },

  async setup(target) {
    await commands.migrate(target);
    await commands.configure(target);
    await commands.lead(target);
  },
};

const [cmd, target] = process.argv.slice(2);
if (!commands[cmd] || !['test', 'prod'].includes(target)) {
  fail('usage: node scripts/sb.mjs <check|keys|migrate|configure|lead|setup|clean> <test|prod>');
}
await commands[cmd](target);
