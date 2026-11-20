import { test, expect } from '@playwright/test';
import { addNote, addResponse, advance, call, memberPage, seed } from './helpers';

test('job 1: a person writes a question down when no round is open, and it waits for the next brainstorm', async ({ browser }) => {
  const s = await seed(['Ana Test'], { round: false });
  const ana = await memberPage(browser, s.members[0].token);
  await expect(ana.getByTestId('round-step')).toHaveAttribute('data-step', 'none');

  const form = ana.getByTestId('write-now');
  await form.getByLabel('Question or worry').fill('Invented thought with no round open');
  await form.getByRole('button', { name: 'Save it for the next brainstorm' }).click();
  await expect(ana.getByTestId('saved-response')).toHaveText(['Invented thought with no round open']);
  await expect(form.getByLabel('Question or worry')).toHaveValue('');

  // The lead starts a round. The saved response is in the brainstorm.
  await call(s.lead.rpc('start_round', { p_workspace: s.workspace }));
  await ana.reload();
  const r = ana.getByTestId('response').filter({ hasText: 'Invented thought with no round open' });
  await expect(r).toHaveCount(1);
  await r.getByLabel('Question', { exact: true }).fill('Is the invented thought true?');
  await r.getByRole('button', { name: 'Add the note' }).click();
  await expect(r.getByTestId('my-note')).toHaveCount(1);
  await expect(ana.getByTestId('write-now')).toHaveCount(0);
});

test('job 1: a person writes a question down after a round, and the next brainstorm shows only new responses', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  const used = await addResponse(s, 0, 'Invented response used in round one');
  const n = await call(s.members[0].client.from('notes')
    .insert({ workspace_id: s.workspace, round_id: s.round, member_id: s.members[0].id, response_id: used, body: 'Invented round one question?' })
    .select()) as { id: string }[];
  expect(n).toHaveLength(1);
  await addNote(s, 0, 'Invented note with no response');
  const unknown = await addResponse(s, 0, 'Invented response with no known question');
  await call(s.members[0].client.from('responses').update({ question_unknown: true }).eq('id', unknown).select());
  await advance(s, 4); // closed

  const ana = await memberPage(browser, s.members[0].token);
  const form = ana.getByTestId('write-now');
  await form.getByLabel('Question or worry').fill('Invented thought after the round');
  await form.getByRole('button', { name: 'Save it for the next brainstorm' }).click();
  await expect(ana.getByTestId('saved-response')).toHaveText(['Invented thought after the round']);

  await call(s.lead.rpc('start_round', { p_workspace: s.workspace }));
  await ana.reload();
  await expect(ana.getByTestId('response')).toHaveCount(1);
  await expect(ana.getByTestId('response')).toContainText('Invented thought after the round');
});
