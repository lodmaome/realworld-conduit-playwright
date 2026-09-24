# 0003: Package manager for the test project

- Status: Accepted
- Date: 2026-09-18

## Context

Both target application repos (Angular frontend, ASP.NET Core backend's tooling) use
Bun. That doesn't obligate the test project to match — the Playwright/TypeScript test
project is a separate npm package with its own dependency needs, and it's the artifact
a reviewer (recruiter, hiring engineer) is most likely to actually clone and run.

Realistic options: npm, pnpm, Bun.

## Decision

Use npm for the Playwright test project.

## Consequences

**Positive**

- Zero-friction clone-and-run for any reviewer: npm ships with Node, no extra install
  step, no unfamiliar tool between them and `npm ci && npx playwright test`.
- Universally recognized in QA/test-engineering job postings and by anyone skimming the
  repo — the point of this project is to be reviewed, not just to run fast locally.
- No compatibility question marks with the Playwright CLI, VS Code extension, or CI
  actions, all of which assume npm/Node as the default path.

**Negative**

- Slower installs than pnpm or Bun, and no automatic dependency-duplication savings —
  irrelevant at this project's size (a handful of test dependencies), but a real
  tradeoff at larger scale.
- Slight inconsistency with the two app repos' own tooling (Bun) — a contributor moving
  between "run the app" and "run the tests" switches package managers. Documented in the
  root README's setup instructions so it's not a surprise.

## Alternatives considered

- **Bun** — rejected as the primary choice despite matching the app repos. It's the
  least common choice for a Playwright test project specifically, and an unusual pick a
  reviewer has to stop and think about isn't the impression this portfolio should make.
- **pnpm** — a reasonable runner-up (fast, increasingly common in senior frontend/QA
  shops), but npm's near-universal familiarity won out for a project whose primary
  purpose is being read and run by other people.
