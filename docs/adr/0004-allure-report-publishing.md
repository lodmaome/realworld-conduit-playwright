# 0004: Publish Allure reports to GitHub Pages

- Status: Accepted
- Date: 2026-09-18

## Context

Allure is the chosen test reporting layer (per the project scope). A generated Allure
report needs somewhere to live after a CI run: it can be uploaded as a CI artifact that
only someone with repo access can download and open locally, or published as a static
site that anyone with the link can open directly in a browser.

This project's stated purpose is a job-application portfolio piece, which changes the
calculus versus an internal company project: the audience explicitly includes people
outside the repo (recruiters, hiring engineers) who will not clone it or dig through
CI artifacts.

## Decision

Publish the Allure report as a live static site via GitHub Pages after each CI run on
the default branch, in addition to (not instead of) keeping raw results as a CI
artifact for debugging a specific run.

How this was built, and what building it revealed (Allure 3, where history is stored, the
analytics the report embeds), is in [0011](0011-allure-report-publishing.md).

## Consequences

**Positive**

- A single clickable link shows real run history, trend graphs, and flake data —
  concrete evidence of the project working, linkable from a resume or cover letter
  without asking anyone to clone or configure anything.
- Forces the reporting pipeline to be genuinely CI-driven end to end (generate → deploy),
  which is itself a small, legitimate demonstration of CI/CD competence.

**Negative**

- Extra CI step and GitHub Pages configuration to build and maintain, beyond what a
  purely internal project would need.
- Report history/trend data lives in whatever the chosen Allure GitHub Pages action
  persists between deploys (typically a separate branch or history file) — this needs a
  deliberate retention approach, or trend graphs reset on every deploy instead of
  accumulating.
- Publishing test results publicly means being deliberate about not leaking anything
  sensitive into report output (this project only tests a public demo app with
  synthetic factory-generated data, so the risk is low, but it's worth stating rather
  than assuming).

## Alternatives considered

- **CI artifact / local-only** — rejected as the sole mechanism. Simpler and avoids the
  Pages setup, but produces nothing a reviewer can see without cloning the repo and
  running it themselves, which defeats the point of a portfolio artifact. Kept as a
  supplementary output for debugging individual runs, just not the primary delivery
  mechanism.
