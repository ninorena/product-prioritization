import { test, expect } from '@playwright/test';
import { addNote, advance, memberPage, seed, vote } from './helpers';

test('job 11: a person gives notes one topic, and the result shows the votes for each topic', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const n1 = await addNote(s, 0, 'Invented price question one');
  const n2 = await addNote(s, 1, 'Invented price question two');
  const n3 = await addNote(s, 1, 'Invented onboarding question');
  await advance(s, 3);
  await vote(s, 0, n1);
  await vote(s, 1, n2);
  await vote(s, 1, n3);
  await advance(s); // closed

  const ana = await memberPage(browser, s.members[0].token);
  for (const text of ['price question one', 'price question two']) {
    const row = ana.getByTestId('result-row').filter({ hasText: text });
    await row.getByLabel('Topic').fill('Invented pricing');
    await row.getByRole('button', { name: 'Save the topic' }).click();
    await expect(row.getByTestId('topic-saved')).toHaveText('Invented pricing');
  }
  const topic = ana.locator('[data-testid="topic-row"][data-topic="Invented pricing"]');
  await expect(topic).toHaveAttribute('data-votes', '2');
  await expect(topic).toHaveAttribute('data-notes', '2');

  const ben = await memberPage(browser, s.members[1].token);
  await expect(ben.locator('[data-testid="topic-row"][data-topic="Invented pricing"]')).toHaveAttribute('data-votes', '2');
});
