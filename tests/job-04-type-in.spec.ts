import { test, expect } from '@playwright/test';
import { memberPage, seed } from './helpers';

test('job 4: a member types in questions from a notepad, one after the other', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);
  const lines = ['Notepad line one about the invented app?', 'Notepad line two about delivery?', 'Notepad line three about price?'];
  await page.getByTestId('add-note').click();
  // After Enter, the note editor stays open for the next note.
  for (const [i, line] of lines.entries()) {
    await page.getByTestId('note-input').fill(line);
    await page.getByTestId('note-input').press('Enter');
    await expect(page.getByTestId('my-note')).toHaveCount(i + 1);
  }
  await page.reload();
  const notes = page.getByTestId('my-note');
  await expect(notes).toHaveCount(3);
  for (const [i, line] of lines.entries()) await expect(notes.nth(i)).toContainText(line);
});
