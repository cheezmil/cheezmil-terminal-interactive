import { spawnSync } from 'node:child_process';

const result = spawnSync('cqg', ['delete-repo', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);

