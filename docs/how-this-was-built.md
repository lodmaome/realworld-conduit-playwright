# How this repo was built

This repository was built with AI assistance in every part of it: the tests, page objects,
fixtures, CI, tooling, and every document, including the ADRs. The assistant was Claude Code; each
commit carries a `Co-Authored-By` trailer naming the model. It is one of two portfolios by the same
author. The other,
[playwright-qa-portfolio](https://github.com/lodmaome/playwright-qa-portfolio), was built by hand.
This page says what that means, so the two can be read for what each one shows.

## Who did what

**The author** set the goal (a portfolio that shows senior-level test architecture and the
reasoning behind it), the scope and what is out of scope, and the choice of application under
test. The author reviewed the results and the evidence, chose between options when the assistant
put them, and decided what was committed and pushed.

**The assistant** proposed designs and their trade-offs, wrote the code, tests, CI and
documentation, ran everything, probed the real application before writing tests against it, and
reported the results, including the failures and the things it could not verify.

## The working agreement

- **Every meaningful decision is written down with measured evidence**, not asserted. That is what
  the [ADRs](adr/README.md) are: the context, what was measured, and what was given up.
- **Nothing is committed or pushed without the author's go-ahead.**
- **Results are reported as they are.** A failing check, a skipped step and an unverified claim are
  stated as such. The [test strategy](test-strategy.md) ends in a list of known limitations, and
  ADRs carry a "still unverified" note where that applies.

## Guarding against how AI-written tests go wrong

AI-written tests tend to fail in a few recognisable ways. What was done about each, with where to
see it:

| Risk                                                     | What was done                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A test that passes without proving anything              | Tests that assert something did _not_ happen were mutation-checked: the failure was removed and the test had to fail. One invalid mutation that wrongly passed is recorded as invalid, not hidden ([0013](adr/0013-api-overrides-for-the-mocked-ui-project.md)).                                               |
| A confident, plausible, wrong conclusion                 | Behaviour was probed against the real application before tests were written from it, and probes were themselves checked. Two first conclusions were overturned this way: "there is no error list" and "the app has a double-submit bug" (both in [0013](adr/0013-api-overrides-for-the-mocked-ui-project.md)). |
| A design flaw that only shows up later                   | The flake budget's first version counted runs, not a test's own observations, and could never trigger for the nightly-only suites; found by reasoning, then pinned with a regression test ([0012](adr/0012-flake-handling.md)).                                                                                |
| A first pass that looks right and isn't                  | The flake dashboard was checked with axe in four states and both colour schemes because the first pass found a contrast failure in the one state that looked fine ([0012](adr/0012-flake-handling.md)).                                                                                                        |
| Tests and documents that overstate                       | Known gaps are listed in the strategy, and an existing test whose title claims more than it asserts is noted rather than quietly edited ([test strategy](test-strategy.md)).                                                                                                                                   |
| "It works on my machine" being taken as "it works in CI" | Changes are pushed and the `full` tier is run on GitHub Actions; the published report and flake dashboard are the record.                                                                                                                                                                                      |

## What this shows, and what it doesn't

It shows how the author directs and reviews AI-assisted test engineering: scoping, choosing
between designs, insisting on evidence, and catching the assistant's mistakes. It is not evidence
of writing every line by hand. That is what the other portfolio is for, and the two are meant to
be read together.

## Checking the claims yourself

- The live [Allure report](https://lodmaome.github.io/realworld-conduit-playwright/) and the
  [flake dashboard](https://lodmaome.github.io/realworld-conduit-playwright/flakes/) come from real
  CI runs on `main`.
- `git log` shows every commit and its co-author trailer.
- The ADRs record the measurements behind their claims, and the [quick start](../README.md) runs
  the whole suite against the same pinned application.
