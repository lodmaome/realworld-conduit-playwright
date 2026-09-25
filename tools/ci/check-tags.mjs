// @ts-check
// Fails when the test suite breaks the rules about tags and quarantine:
//  - a tag outside the agreed vocabulary. Tag-based selection fails silently: a typo like
//    `@smoek` doesn't error, the test just drops out of the smoke run;
//  - a @quarantine test with no reason and expiry, a malformed or expired one, or a
//    quarantine annotation without the tag (which would leave the test in the gating tiers);
//  - no @smoke tests at all.
// See docs/adr/0008-test-tiers-and-ci-triggers.md and docs/adr/0012-flake-handling.md.
import { listTests } from '../flake-report/list-tests.mjs';
import { validateTests } from '../flake-report/validate.mjs';

const tests = listTests();
const count = (tag) => tests.filter((t) => t.tags.includes(tag)).length;
console.log(`${tests.length} tests: ${count('smoke')} @smoke, ${count('quarantine')} @quarantine`);

const problems = validateTests(tests);
problems.forEach((problem) => console.error(problem));
process.exit(problems.length > 0 ? 1 : 0);
