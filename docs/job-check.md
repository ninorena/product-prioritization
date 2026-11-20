# Job check

One row for each job in [jobs.md](jobs.md): the test that proves it, and the
result of the last `npm test` run on the test Supabase project.

Last run: 2026-11-20, milestone 1. 17 Playwright tests passed, and the offline
database check (`npm run test:db`) passed.

| # | Job | Test | Result |
|---|---|---|---|
| 1 | Write a question down at once | Milestone 2 | not built yet |
| 2 | See prompts about what can make the product fail | `tests/job-02-prompts.spec.ts` | pass |
| 3 | Turn a response into questions, or mark "question not known" | `tests/job-03-response-to-notes.spec.ts` | pass |
| 4 | Type in responses from a notepad | `tests/job-04-type-in.spec.ts` | pass |
| 5 | Place each note on my own board, alone | `tests/job-05-own-board.spec.ts` | pass |
| 6 | Compare the boards one time | `tests/job-06-compare.spec.ts` | pass |
| 7 | Ask which note we know less about, on a tie | `tests/job-07-tie.spec.ts` | pass |
| 8 | Think about how hard a question is to answer (Harder to Easier) | `tests/job-08-harder-easier.spec.ts` | pass |
| 9 | Vote with the group | `tests/job-09-vote.spec.ts` | pass |
| 10 | Move a note to icebox, in progress, or closed | Milestone 2 | not built yet |
| 11 | Put notes about one topic together | Milestone 2 | not built yet |
| 12 | Export the result as a PDF | Milestone 2 | not built yet |

Also tested: the private links (`tests/access-links.spec.ts`) and one full
round in the screens (`tests/round-full.spec.ts`).
