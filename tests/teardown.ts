import { execFileSync } from 'node:child_process';

export default function teardown() {
  execFileSync('node', ['scripts/sb.mjs', 'clean', 'test'], { stdio: 'inherit' });
}
