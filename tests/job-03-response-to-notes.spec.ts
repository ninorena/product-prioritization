import { test, expect } from '@playwright/test';
import { memberPage, seed } from './helpers';

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

  await page.reload();
  await expect(page.getByTestId('response').nth(1).getByLabel('Question not known')).toBeChecked();
  await expect(page.getByTestId('my-note')).toHaveCount(2);
});
