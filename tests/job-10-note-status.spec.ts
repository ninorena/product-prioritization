import { test, expect } from '@playwright/test';
import { addNote, advance, call, memberPage, seed, vote } from './helpers';

test('job 10: after the round, a person moves a note off the board, and the other people see it', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const a = await addNote(s, 0, 'Invented question for the icebox');
  await addNote(s, 1, 'Invented question that stays');
  await advance(s, 3);
  await vote(s, 0, a);
  await advance(s); // closed

  const ana = await memberPage(browser, s.members[0].token);
  const row = ana.getByTestId('result-row').filter({ hasText: 'for the icebox' });
  await row.getByLabel('Status').selectOption('icebox');
  await expect(ana.getByTestId('result-row')).toHaveCount(1);
  const off = ana.getByTestId('off-board-note');
  await expect(off).toHaveCount(1);
  await expect(off).toHaveAttribute('data-status', 'icebox');

  // Ben sees the same, and moves it on to in progress.
  const ben = await memberPage(browser, s.members[1].token);
  const benOff = ben.getByTestId('off-board-note');
  await expect(benOff).toHaveAttribute('data-status', 'icebox');
  await benOff.getByLabel('Status').selectOption('in_progress');
  await expect(benOff).toHaveAttribute('data-status', 'in_progress');

  // The list stays in use when the next round starts.
  await call(s.lead.rpc('start_round', { p_workspace: s.workspace }));
  await ana.reload();
  await expect(ana.getByTestId('round-step')).toHaveAttribute('data-step', 'brainstorm');
  await expect(ana.getByTestId('off-board-note')).toHaveAttribute('data-status', 'in_progress');

  // Back on the board.
  await ana.getByTestId('off-board-note').getByLabel('Status').selectOption('board');
  await expect(ana.getByTestId('off-board-note')).toHaveCount(0);
});

test('job 10: a person cannot move a note off the board while the round is open', async () => {
  const s = await seed(['Ana Test']);
  const a = await addNote(s, 0, 'Invented question in an open round');
  await advance(s, 3); // vote
  const { error } = await s.members[0].client.rpc('set_note_status', { p_note: a, p_status: 'icebox' });
  expect(error).not.toBeNull();
});
