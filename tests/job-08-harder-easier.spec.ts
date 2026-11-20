import { test, expect } from '@playwright/test';
import { addNote, advance, call, clickBoard, memberPage, seed } from './helpers';

test('job 8: the horizontal axis goes from Harder to Easier, and no note sits on a line', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Hard invented question');
  await addNote(s, 0, 'Easy invented question');
  await addNote(s, 0, 'Middle invented question');
  await advance(s);

  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByText('Harder')).toBeVisible();
  await expect(ana.getByText('Easier')).toBeVisible();

  await ana.getByTestId('tray-note').filter({ hasText: 'Hard invented' }).click();
  await clickBoard(ana, 0.1, 0.8);
  await ana.getByTestId('tray-note').filter({ hasText: 'Easy invented' }).click();
  await clickBoard(ana, 0.9, 0.8);
  await ana.getByTestId('tray-note').filter({ hasText: 'Middle invented' }).click();
  await clickBoard(ana, 0.5, 0.5);

  await expect(ana.getByTestId('placed-note').filter({ hasText: 'Hard invented' })).toHaveAttribute('data-quadrant', 'More important, Harder');
  await expect(ana.getByTestId('placed-note').filter({ hasText: 'Easy invented' })).toHaveAttribute('data-quadrant', 'More important, Easier');

  await expect.poll(async () => (await s.members[0].client.from('placements').select('x').eq('member_id', s.members[0].id)).data?.length).toBe(3);
  const rows = await call(s.members[0].client.from('placements').select('x,y').eq('member_id', s.members[0].id)) as { x: number; y: number }[];
  expect(rows).toHaveLength(3);
  for (const r of rows) {
    expect(r.x).not.toBe(0.5);
    expect(r.y).not.toBe(0.5);
  }

  // The database refuses a note on a line, too.
  const bad = await s.members[0].client.from('placements')
    .update({ x: 0.5 }).eq('member_id', s.members[0].id).select();
  expect(bad.error).not.toBeNull();
});
