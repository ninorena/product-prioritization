import { test, expect } from '@playwright/test';
import { addNote, advance, clickBoard, memberPage, place, seed } from './helpers';
import type { Placement } from '../src/types';

test('job 6: compare shows a small board for each person, the table puts disagreements first, and a person changes their board', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const agree = await addNote(s, 0, 'Agreed invented question');
  const differ = await addNote(s, 1, 'Disputed invented question');
  await advance(s);
  await place(s, 0, agree, 0.8, 0.8);
  await place(s, 1, agree, 0.7, 0.9);
  await place(s, 0, differ, 0.2, 0.8);
  await place(s, 1, differ, 0.8, 0.2);
  await advance(s); // open the compare step

  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByTestId('small-board')).toHaveCount(2);
  const rows = ana.getByTestId('compare-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-differ', 'true');
  await expect(rows.first()).toContainText('Disputed invented question');
  await expect(rows.first()).toContainText('More important, Harder');
  await expect(rows.first()).toContainText('Less important, Easier');
  await expect(rows.nth(1)).toHaveAttribute('data-differ', 'false');

  // Ana opens Ben's board full size, goes back, then moves the disputed
  // note on her own board to Ben's quadrant.
  await ana.getByTestId('small-board').filter({ hasText: 'Ben Test' }).click();
  await expect(ana.getByTestId('open-board')).toHaveText('Board of Ben Test');
  await expect(ana.getByTestId('tray')).toHaveCount(0);
  await ana.keyboard.press('Escape');
  await ana.getByTestId('small-board').filter({ hasText: 'Ana Test (you)' }).click();
  await ana.getByTestId('placed-note').filter({ hasText: 'Disputed' }).click();
  await clickBoard(ana, 0.85, 0.15);
  await expect.poll(async () => {
    const { data } = await s.members[0].client.from('placements').select('*').eq('note_id', differ).eq('member_id', s.members[0].id);
    return (data as Placement[])[0]?.x > 0.5;
  }).toBe(true);
  await ana.reload();
  await expect(ana.getByTestId('compare-row').filter({ hasText: 'Disputed' })).toHaveAttribute('data-differ', 'false');
});
