import { test, expect } from '@playwright/test';
import { memberPage, seed } from './helpers';

test('job 4: a member types in responses from a notepad, with no prompt', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);
  const lines = ['Notepad line one about the invented app', 'Notepad line two about delivery', 'Notepad line three about price'];
  for (const line of lines) {
    await page.getByLabel('Response').fill(line);
    await page.getByRole('button', { name: 'Save the response' }).click();
  }
  await page.reload();
  const responses = page.getByTestId('response');
  await expect(responses).toHaveCount(3);
  for (const [i, line] of lines.entries()) await expect(responses.nth(i)).toContainText(line);
});
