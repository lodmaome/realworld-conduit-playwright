// @ts-check
// Runs several npm scripts in order and keeps going when one fails, then exits non-zero if
// any did. `a && b && c` stops at the first failure, which would hide a visual regression
// behind an unrelated functional one — and `;` isn't portable to cmd.exe.
//
// Usage: node tools/ci/run-all.mjs test:regression test:a11y test:visual
import { spawnSync } from 'node:child_process';

const scripts = process.argv.slice(2);
if (scripts.length === 0) {
  console.error('Usage: run-all.mjs <npm-script> [<npm-script> ...]');
  process.exit(2);
}

const results = scripts.map((script) => {
  console.log(`\n=== npm run ${script} ===`);
  // shell: true so `npm` resolves to npm.cmd on Windows.
  const { status } = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
  return { script, status: status ?? 1 };
});

console.log('\n=== summary ===');
for (const { script, status } of results) {
  console.log(`${status === 0 ? 'passed' : 'FAILED'}  ${script}`);
}
process.exit(results.some(({ status }) => status !== 0) ? 1 : 0);
