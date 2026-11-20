# Job check

One row for each job in [jobs.md](jobs.md): the test that proves it, and the
result of the last `npm test` run on the test Supabase project.

Last run: 2026-11-20, milestone 2. 24 Playwright tests passed, and the offline
database check (`npm run test:db`) passed.

| # | Job | Test | Result |
|---|---|---|---|
| 1 | Write a question down at once | `tests/job-01-write-any-time.spec.ts` | pass |
| 2 | See prompts about what can make the product fail | `tests/job-02-prompts.spec.ts` | pass |
| 3 | Turn a response into questions, or mark "question not known" | `tests/job-03-response-to-notes.spec.ts` | pass |
| 4 | Type in responses from a notepad | `tests/job-04-type-in.spec.ts` | pass |
| 5 | Place each note on my own board, alone | `tests/job-05-own-board.spec.ts` | pass |
| 6 | Compare the boards one time | `tests/job-06-compare.spec.ts` | pass |
| 7 | Ask which note we know less about, on a tie | `tests/job-07-tie.spec.ts` | pass |
| 8 | Think about how hard a question is to answer (Harder to Easier) | `tests/job-08-harder-easier.spec.ts` | pass |
| 9 | Vote with the group | `tests/job-09-vote.spec.ts` | pass |
| 10 | Move a note to icebox, in progress, or closed | `tests/job-10-note-status.spec.ts` | pass |
| 11 | Put notes about one topic together (a topic label; version 1 does not merge notes) | `tests/job-11-topic.spec.ts` | pass |
| 12 | Export the result as a PDF | `tests/job-12-pdf.spec.ts` | pass |

Also tested: the private links (`tests/access-links.spec.ts`) and one full
round in the screens (`tests/round-full.spec.ts`).
