import { test, expect } from '@playwright/test';
import { addNote, advance, memberClient, seed } from './helpers';

test('access: a canceled private link is refused, and that session reads zero rows', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Invented question before the cancel');
  await advance(s);

  // A session that used the link before the cancel.
  const before = s.members[0].client;
  await s.lead.rpc('cancel_member_link', { p_member: s.members[0].id });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/#/j/${s.members[0].token}`);
  await expect(page.getByTestId('link-refused')).toBeVisible();

  const fresh = await memberClient(s.members[0].token);
  expect(fresh.workspace).toBeNull();
  for (const c of [before, fresh.client]) {
    for (const table of ['workspaces', 'members', 'rounds', 'notes', 'placements', 'responses']) {
      const { data } = await c.from(table).select('*');
      expect(data, `${table} must return zero rows`).toHaveLength(0);
    }
  }
});

test('access: the same link works on a second device, and a new link replaces the old one', async () => {
  const s = await seed(['Ana Test']);
  const second = await memberClient(s.members[0].token);
  expect(second.workspace).toBe(s.workspace);

  const { data: newToken } = await s.lead.rpc('new_member_link', { p_member: s.members[0].id });
  expect((await memberClient(s.members[0].token)).workspace).toBeNull();
  expect((await memberClient(newToken as string)).workspace).toBe(s.workspace);
  const { data } = await second.client.from('workspaces').select('*');
  expect(data).toHaveLength(0);
});
