import { test, expect } from '@playwright/test';
import { addNote, advance, memberPage, place, seed, stepIs, leadPage } from './helpers';

test('job 9: each person has 3 votes, sees other boards, and counts show only after the vote closes', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const ids = [];
  for (let i = 1; i <= 4; i++) ids.push(await addNote(s, 0, `Vote invented question ${i}`));
  await advance(s);
  for (const id of ids) await place(s, 1, id, 0.3, 0.7);
  await advance(s, 2); // compare, vote

  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 3 of 3 dots left.');
  const rows = ana.getByTestId('vote-row');
  for (let i = 0; i < 3; i++) await rows.nth(i).getByRole('button', { name: 'Add a dot' }).click();
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 0 of 3 dots left.');
  await expect(rows.nth(3).getByRole('button', { name: 'Add a dot' })).toBeDisabled();

  // Ana looks at Ben's board.
  await ana.getByTestId('small-board').filter({ hasText: 'Ben Test' }).click();
  await expect(ana.getByTestId('placed-note')).toHaveCount(4);

  // Ben cannot see Ana's votes before the vote closes.
  const ben = await memberPage(browser, s.members[1].token);
  await expect(ben.getByTestId('results')).toHaveCount(0);
  const seen = await s.members[1].client.from('votes').select('*').eq('round_id', s.round);
  expect(seen.data).toHaveLength(0);

  // The lead closes the vote. Everyone sees the counts.
  const lead = await leadPage(browser);
  await lead.goto(`/#/w/${s.workspace}`);
  await lead.getByTestId('advance').click();
  await stepIs(ben, 'closed');
  const results = ben.getByTestId('result-row');
  await expect(results).toHaveCount(4);
  await expect(ben.getByTestId('result-row').filter({ hasText: 'question 4' })).toHaveAttribute('data-count', '0');
  await expect(ben.locator('[data-testid="result-row"][data-count="1"]')).toHaveCount(3);
});

test('job 9: a person removes a vote and gets it back', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Removable vote invented question');
  await advance(s, 3);
  const ana = await memberPage(browser, s.members[0].token);
  const row = ana.getByTestId('vote-row').first();
  await row.getByRole('button', { name: 'Add a dot' }).click();
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 2 of 3 dots left.');
  await row.getByRole('button', { name: 'Remove a dot' }).click();
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 3 of 3 dots left.');
  await expect.poll(async () => (await s.members[0].client.from('votes').select('*')).data?.length).toBe(0);
});

test('job 9: a person puts 2 dots on one note, and the result counts 2', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Two dots invented question');
  await addNote(s, 0, 'One dot invented question');
  await advance(s, 3);
  const ana = await memberPage(browser, s.members[0].token);
  const two = ana.getByTestId('vote-row').filter({ hasText: 'Two dots' });
  await two.getByRole('button', { name: 'Add a dot' }).click();
  await expect(two).toHaveAttribute('data-dots', '1');
  await two.getByRole('button', { name: 'Add a dot' }).click();
  await expect(two).toHaveAttribute('data-dots', '2');
  await ana.getByTestId('vote-row').filter({ hasText: 'One dot' }).getByRole('button', { name: 'Add a dot' }).click();
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 0 of 3 dots left.');
  await advance(s);
  await stepIs(ana, 'closed');
  await expect(ana.getByTestId('result-row').filter({ hasText: 'Two dots' })).toHaveAttribute('data-count', '2');
  await expect(ana.getByTestId('result-row').filter({ hasText: 'One dot' })).toHaveAttribute('data-count', '1');
});

test('job 9: an open page moves to the next step without a reload', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Poll invented question');
  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByTestId('round-step')).toHaveAttribute('data-step', 'brainstorm');
  await advance(s);
  await expect(ana.getByTestId('round-step')).toHaveAttribute('data-step', 'placement', { timeout: 15_000 });
  await expect(ana.getByTestId('tray-note')).toHaveCount(1);
});
