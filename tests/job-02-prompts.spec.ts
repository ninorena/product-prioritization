import { test, expect } from '@playwright/test';
import { memberPage, seed } from './helpers';
import { PROMPTS } from '../src/prompts';

test('job 2: a member sees the prompts about what can make the product fail', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);
  const prompts = page.getByTestId('prompts').locator('li');
  await expect(prompts).toHaveCount(PROMPTS.length);
  await expect(prompts.first()).toHaveText('What is risky about this product?');
  await expect(page.getByTestId('prompts')).toContainText('What do you think could make this product fail?');
});
