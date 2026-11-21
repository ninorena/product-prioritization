import { test, expect } from '@playwright/test';
import { addNote, advance, clickBoard, dragToBoard, memberPage, place, seed } from './helpers';

test('job 5: each person places every note on their own board, alone', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  await addNote(s, 0, 'Will invented users pay monthly?');
  await addNote(s, 1, 'Can we ship the invented feature in a week?');
  await advance(s); // close the brainstorm

  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByTestId('tray-note')).toHaveCount(2);
  await ana.getByTestId('tray-note').first().click();
  await clickBoard(ana, 0.2, 0.8);
  await ana.getByTestId('tray-note').first().click();
  await clickBoard(ana, 0.8, 0.3);
  await expect(ana.getByTestId('placed-count')).toHaveText('Placed 2 of 2');
  await expect(ana.getByTestId('placed-note')).toHaveCount(2);

  // Ben's board is empty: he cannot see where Ana put the notes.
  const ben = await memberPage(browser, s.members[1].token);
  await expect(ben.getByTestId('placed-note')).toHaveCount(0);
  await expect(ben.getByTestId('placed-count')).toHaveText('Placed 0 of 2');
});

test('job 5: a person drags a note onto the board, then drags it to a new place', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Dragged invented question');
  await advance(s);
  const ana = await memberPage(browser, s.members[0].token);
  await dragToBoard(ana, ana.getByTestId('tray-note').first(), 0.2, 0.8);
  const placed = ana.getByTestId('placed-note');
  await expect(placed).toHaveAttribute('data-quadrant', 'More important, Harder');
  await expect(ana.getByTestId('placed-count')).toHaveText('Placed 1 of 1');
  await dragToBoard(ana, placed, 0.8, 0.2);
  await expect(placed).toHaveAttribute('data-quadrant', 'Less important, Easier');
  await expect.poll(async () => (await s.members[0].client.from('placements').select('x').eq('member_id', s.members[0].id)).data?.[0]?.x).toBeGreaterThan(0.5);
});

test('job 5: a keyboard user places a note with the quadrant buttons', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Keyboard invented question');
  await advance(s);
  const ana = await memberPage(browser, s.members[0].token);
  await ana.getByTestId('tray-note').first().focus();
  await ana.keyboard.press('Enter');
  await ana.getByTestId('quadrant-picker').getByRole('button', { name: 'Less important, Harder' }).click();
  await expect(ana.getByTestId('placed-note')).toHaveAttribute('data-quadrant', 'Less important, Harder');
});

test('job 5: in the placement step, person A reads zero placements of person B from the database', async () => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const n = await addNote(s, 0, 'Is the invented market big enough?');
  await advance(s);
  await place(s, 1, n, 0.3, 0.7);

  const { data, error } = await s.members[0].client
    .from('placements').select('*').eq('member_id', s.members[1].id);
  expect(error).toBeNull();
  expect(data).toHaveLength(0);

  // Ben can read his own placement, so the row exists.
  const own = await s.members[1].client.from('placements').select('*').eq('member_id', s.members[1].id);
  expect(own.data).toHaveLength(1);
});
