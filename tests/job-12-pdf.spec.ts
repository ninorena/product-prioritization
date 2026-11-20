import { test, expect } from '@playwright/test';
import { addNote, advance, leadPage, place, seed, vote } from './helpers';

test('job 12: the lead exports the result of a round as a PDF', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const n1 = await addNote(s, 0, 'Invented question for the report');
  await advance(s);
  await place(s, 0, n1, 0.8, 0.8);
  await advance(s, 2);
  await vote(s, 0, n1);
  await advance(s); // closed

  const lead = await leadPage(browser);
  await lead.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed++; };
  });
  await lead.goto(`/#/w/${s.workspace}`);
  await lead.getByRole('button', { name: 'Export as PDF' }).click();
  expect(await lead.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // The printed page holds the result and the boards, and no controls.
  await lead.emulateMedia({ media: 'print' });
  await expect(lead.getByTestId('results')).toBeVisible();
  await expect(lead.getByTestId('result-boards').getByTestId('placed-note')).toHaveCount(1);
  await expect(lead.getByTestId('members')).toBeHidden();
  await expect(lead.getByRole('button', { name: 'Export as PDF' })).toBeHidden();
  await expect(lead.getByTestId('result-row').getByLabel('Status')).toBeHidden();

  const pdf = await lead.pdf();
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(5000);
});
