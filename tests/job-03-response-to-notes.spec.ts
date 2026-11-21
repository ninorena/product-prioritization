import { test, expect } from '@playwright/test';
import { advance, memberPage, seed, writeNote } from './helpers';

test('job 3: a person writes questions straight onto the canvas and changes one', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const page = await memberPage(browser, s.members[0].token);
  await writeNote(page, 'How specific must the target profile of the invented app be?');
  await writeNote(page, 'Who is the first buyer of the invented app?');
  await expect(page.getByTestId('my-note')).toHaveCount(2);

  // A click on a note opens it for edits. Enter saves the change.
  await page.getByTestId('my-note').filter({ hasText: 'first buyer' }).getByRole('button', { name: /first buyer/ }).click();
  const input = page.getByTestId('note-input');
  await input.fill('Who is the first paying buyer of the invented app?');
  await input.press('Enter');
  await expect(page.getByTestId('my-note').filter({ hasText: 'first paying buyer' })).toHaveCount(1);

  await expect.poll(async () => (await s.members[0].client.from('notes').select('body').ilike('body', '%paying%')).data?.length).toBe(1);
  await page.reload();
  await expect(page.getByTestId('my-note')).toHaveCount(2);
  // No response step is left.
  await expect(page.getByLabel('Response')).toHaveCount(0);
  await expect(page.getByText('Question not known')).toHaveCount(0);
});

test('job 3: a person deletes a note in the brainstorm, and it never reaches the pool', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const page = await memberPage(browser, s.members[0].token);
  await writeNote(page, 'Wrong invented question?');
  const note = page.getByTestId('my-note');
  await note.hover();
  await note.getByRole('button', { name: 'Delete this note' }).click();
  await expect(note).toHaveCount(0);
  await expect.poll(async () => (await s.members[0].client.from('notes').select('*')).data?.length).toBe(0);
  await page.reload();
  await expect(page.getByTestId('my-note')).toHaveCount(0);
  await advance(s);
  const { data } = await s.members[1].client.from('notes').select('*').eq('round_id', s.round);
  expect(data).toHaveLength(0);
});
