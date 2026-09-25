// @ts-check
// The visual suite runs in mcr.microsoft.com/playwright:v<version>-<distro>, and the browser
// build baked into that image only works with the matching @playwright/test. A mismatch
// doesn't fail loudly — it either errors deep inside Playwright or, worse, renders
// differently — so compare the two here. See docs/adr/0009-visual-regression-in-a-pinned-image.md.
import { readFileSync } from 'node:fs';

const dockerfile = 'docker/playwright/Dockerfile';
const wanted = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies['@playwright/test'];
const from = readFileSync(dockerfile, 'utf8').match(
  /^FROM\s+mcr\.microsoft\.com\/playwright:v([\w.]+)-/m,
);

const problems = [];
if (!/^\d+\.\d+\.\d+$/.test(wanted)) {
  problems.push(`@playwright/test must be pinned to an exact version, found "${wanted}"`);
}
if (!from) {
  problems.push(`${dockerfile}: no "FROM mcr.microsoft.com/playwright:v<version>-<distro>" line`);
} else if (from[1] !== wanted) {
  problems.push(`${dockerfile} is on Playwright ${from[1]} but package.json pins ${wanted}`);
}

if (problems.length > 0) {
  problems.forEach((problem) => console.error(problem));
  process.exit(1);
}
console.log(`Playwright ${wanted}: package.json and ${dockerfile} agree`);
