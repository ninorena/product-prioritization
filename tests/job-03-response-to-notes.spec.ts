import { test, expect } from '@playwright/test';
import { advance, memberPage, seed } from './helpers';

test('job 3: one response gives two notes, and another is marked "question not known"', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);

  await page.getByLabel('Prompt').selectOption('What keeps you up at night?');
  await page.getByLabel('Response').fill('I do not know how specific the target profile of the invented app must be.');
  await page.getByRole('button', { name: 'Save the response' }).click();
  await page.getByLabel('Response').fill('Something about the pricing feels off.');
  await page.getByRole('button', { name: 'Save the response' }).click();
  const responses = page.getByTestId('response');
  await expect(responses).toHaveCount(2);

  const first = responses.nth(0);
  await first.getByLabel('Question', { exact: true }).fill('How specific should the target profile be?');
  await first.getByRole('button', { name: 'Add the note' }).click();
  await first.getByLabel('Question', { exact: true }).fill('Who is the first buyer of the invented app?');
  await first.getByRole('button', { name: 'Add the note' }).click();
  await expect(first.getByTestId('my-note')).toHaveCount(2);

  const second = responses.nth(1);
  await second.getByLabel('Question not known').check();
  await expect(second.getByLabel('Question', { exact: true })).toHaveCount(0);

  // Wait for the save before the reload.
  await expect.poll(async () => {
    const { data } = await s.members[0].client.from('responses').select('question_unknown').eq('question_unknown', true);
    return data?.length;
  }).toBe(1);
  await page.reload();
  await expect(page.getByTestId('response').nth(1).getByLabel('Question not known')).toBeChecked();
  await expect(page.getByTestId('my-note')).toHaveCount(2);
});

test('job 3: a person deletes a note in the brainstorm, and it never reaches the pool', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const page = await memberPage(browser, s.members[0].token);
  await page.getByLabel('Response').fill('Invented response with a wrong question');
  await page.getByRole('button', { name: 'Save the response' }).click();
  const r = page.getByTestId('response').first();
  await r.getByLabel('Question', { exact: true }).fill('Wrong invented question?');
  await r.getByRole('button', { name: 'Add the note' }).click();
  await expect(r.getByTestId('my-note')).toHaveCount(1);
  await r.getByTestId('my-note').getByRole('button', { name: 'Delete' }).click();
  await expect(r.getByTestId('my-note')).toHaveCount(0);
  await expect.poll(async () => (await s.members[0].client.from('notes').select('*')).data?.length).toBe(0);
  await page.reload();
  await expect(page.getByTestId('my-note')).toHaveCount(0);
  await advance(s);
  const { data } = await s.members[1].client.from('notes').select('*').eq('round_id', s.round);
  expect(data).toHaveLength(0);
});
