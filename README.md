# product-prioritization

A small web tool to prioritize product risks on a 2x2 board, with a group that cannot meet live.

Each person writes responses to brainstorm prompts and turns them into notes. A note is one question about the product. Each person places every note on their own board, alone. Then the group compares the boards one time, each person can change their board, and the group votes.

The method comes from [Completing a 2x2 risk prioritization matrix](https://kromatic.com/blog/completing-a-2x2-risk-prioritization-matrix/). The jobs the tool must do are in [docs/jobs.md](docs/jobs.md).

## How it works

- The app is a static Vite, React and TypeScript build. It is hosted on GitHub Pages.
- The data is in Supabase. Row level security in Postgres decides what each person can read and write. The SQL is in `supabase/migrations/`.
- The lead signs in with an emailed link. Each member gets one private link from the lead. The link holds a secret token. When a person opens it, the browser signs in to Supabase as an anonymous user, and a database function connects that user to the member.

## Development

1. Copy `.env.example` to `.env` and fill it in. Never commit `.env`.
2. `npm install`
3. `node scripts/sb.mjs setup test` applies the migrations and the auth settings to the test project.
4. `npm test` runs the Playwright tests against the test project.
5. `npm run dev` starts the app on http://localhost:5173 with the test project.

Tests use invented notes only. Real client text never goes into this repo.

## License

MIT. See [LICENSE](LICENSE).
