import { test, expect } from '@playwright/test';
import { memberPage, seed } from './helpers';
import { PROMPTS } from '../src/prompts';

test('job 2: a member gets one prompt at a time about what can make the product fail', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);
  const bar = page.getByTestId('prompts');
  await expect(bar).toContainText('risks and assumptions');
  // No prompt shows until the person asks for one.
  await expect(page.getByTestId('prompt')).toHaveCount(0);
  await bar.getByRole('button', { name: 'Give me a prompt' }).click();
  const first = await page.getByTestId('prompt').textContent();
  expect(PROMPTS).toContain(first);
  await bar.getByRole('button', { name: 'Another prompt' }).click();
  await expect(page.getByTestId('prompt')).not.toHaveText(first!);
  await expect(page.getByTestId('prompt')).toHaveCount(1);
});
