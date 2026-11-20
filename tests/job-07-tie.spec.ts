import { test, expect } from '@playwright/test';
import { addNote, advance, call, leadPage, seed } from './helpers';

test('job 7: a tie in the vote shows "Which one do you know less about?"', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const a = await addNote(s, 0, 'First tied invented question');
  const b = await addNote(s, 1, 'Second tied invented question');
  await advance(s, 3); // placement, compare, vote
  await call(s.members[0].client.from('votes').insert({ note_id: a, member_id: s.members[0].id, round_id: s.round }));
  await call(s.members[1].client.from('votes').insert({ note_id: b, member_id: s.members[1].id, round_id: s.round }));
  await advance(s); // close the vote

  const lead = await leadPage(browser);
  await lead.goto(`/#/w/${s.workspace}`);
  await expect(lead.getByTestId('tie')).toHaveText('Which one do you know less about?');
});

test('job 7: no tie, no tie-break text', async ({ browser }) => {
  const s = await seed(['Ana Test', 'Ben Test']);
  const a = await addNote(s, 0, 'Winning invented question');
  await addNote(s, 1, 'Other invented question');
  await advance(s, 3);
  for (const m of s.members) await call(m.client.from('votes').insert({ note_id: a, member_id: m.id, round_id: s.round }));
  await advance(s);

  const lead = await leadPage(browser);
  await lead.goto(`/#/w/${s.workspace}`);
  await expect(lead.getByTestId('result-row').first()).toHaveAttribute('data-count', '2');
  await expect(lead.getByTestId('tie')).toHaveCount(0);
});

test('job 7: a vote with no votes at all shows no tie-break text', async ({ browser }) => {
  const s = await seed(['Ana Test']);
  await addNote(s, 0, 'Unvoted invented question one');
  await addNote(s, 0, 'Unvoted invented question two');
  await advance(s, 4);
  const lead = await leadPage(browser);
  await lead.goto(`/#/w/${s.workspace}`);
  await expect(lead.getByTestId('result-row')).toHaveCount(2);
  await expect(lead.getByTestId('tie')).toHaveCount(0);
});
