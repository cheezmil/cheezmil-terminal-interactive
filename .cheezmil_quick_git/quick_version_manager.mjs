import { spawnSync } from 'node:child_process';

const result = spawnSync('cqg', ['version', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);

