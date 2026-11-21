import { test, expect, type Page } from '@playwright/test';
import { clickBoard, leadPage, stepIs, writeNote } from './helpers';

// Outcome steps 1 to 8 through the screens: the lead makes a workspace,
// adds a member, and the two of them run one round. Jobs 2, 3, 5, 6 and 9.
test('jobs 2-9: the lead and one member run one full round in the screens', async ({ browser }) => {
  const lead = await leadPage(browser);
  await lead.goto('/');
  await lead.getByLabel('Client name').fill(`Invented client ${Date.now()}`);
  await lead.getByLabel('Your name').fill('Lena Lead');
  await lead.getByRole('button', { name: 'Make the workspace' }).click();
  await expect(lead.getByTestId('workspace')).toBeVisible();

  await lead.getByLabel('Name', { exact: true }).fill('Ana Test');
  await lead.getByRole('button', { name: 'Add a member' }).click();
  const link = await lead.getByTestId('member-link').inputValue();
  expect(link).toContain('#/j/');
  await lead.getByRole('button', { name: 'Start a round' }).click();
  await expect(lead.getByTestId('round-step')).toHaveAttribute('data-step', 'brainstorm');

  const ctx = await browser.newContext();
  const ana = await ctx.newPage();
  await ana.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(ana.getByTestId('workspace')).toBeVisible();
  expect(ana.url()).not.toContain('#/j/'); // the token leaves the address bar

  // Step 1 and 2: each person writes notes straight onto the canvas.
  await writeNote(ana, 'Will invented users finish onboarding?');
  await writeNote(lead, 'Will invented buyers pay the price?');

  // Step 3: the lead closes the brainstorm.
  await lead.getByRole('button', { name: 'Close the brainstorm' }).click();
  await stepIs(ana, 'placement');

  // Step 4: each person places all the notes, alone.
  async function placeAll(page: Page, spots: [number, number][]) {
    for (const [x, y] of spots) {
      await page.getByTestId('tray-note').first().click();
      await clickBoard(page, x, y);
    }
    await expect(page.getByTestId('placed-count')).toHaveText(`Placed ${spots.length} of ${spots.length}`);
  }
  await placeAll(ana, [[0.2, 0.8], [0.8, 0.8]]);
  await placeAll(lead, [[0.8, 0.2], [0.8, 0.8]]);

  // Step 5: compare.
  await lead.getByRole('button', { name: 'Compare', exact: true }).click();
  await stepIs(ana, 'compare');
  await expect(ana.getByTestId('compare-row').first()).toHaveAttribute('data-differ', 'true');

  await expect(ana.getByTestId('small-board')).toHaveCount(2);

  // Step 6: Ana opens her own board and changes it.
  await ana.getByTestId('small-board').filter({ hasText: '(you)' }).click();
  await ana.getByTestId('placed-note').first().click();
  await clickBoard(ana, 0.3, 0.3);

  // Step 7: vote.
  await lead.getByRole('button', { name: 'Vote', exact: true }).click();
  await stepIs(ana, 'vote');
  await ana.getByTestId('vote-row').first().getByRole('button', { name: 'Add a dot' }).click();
  await expect(ana.getByTestId('votes-left')).toHaveText('You have 2 of 3 dots left.');

  // Step 8: the lead closes the vote, and the counts show.
  await stepIs(lead, 'vote');
  await lead.getByRole('button', { name: 'Close the vote' }).click();
  await stepIs(ana, 'closed');
  await expect(ana.locator('[data-testid="result-row"][data-count="1"]')).toHaveCount(1);
});
