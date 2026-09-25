# 0009: Visual regression in a pinned image, on stubbed data

- Status: Accepted
- Date: 2026-09-25

## Context

A screenshot comparison is only meaningful if the same page always renders to the same
pixels, so anything that varies between runs becomes a false failure or, worse, a
regression that gets waved through as noise. Four things vary here:

1. **The machine.** Browser build, fonts, anti-aliasing and OS libraries differ between a
   Windows laptop and a Linux CI runner, so a baseline taken on one fails on the other.
2. **The internet.** The frontend's `index.html` loads Ionicons CSS from
   `code.ionicframework.com` and Google Fonts from `fonts.googleapis.com`. A slow or
   unreachable CDN changes what is drawn.
3. **The data.** Against the real backend, pages show random usernames (which change layout
   width), timestamps, and articles written by other tests sharing the database
   ([0006](0006-backend-database-provider.md)).
4. **The clock and locale.** Dates render in the runner's timezone and locale.

## Decision

**The suite runs only inside a pinned Playwright image, locally and in CI.**
`docker/playwright/Dockerfile` is `mcr.microsoft.com/playwright:v<version>-noble`, with the
tag equal to the exact `@playwright/test` version. `npm run check:playwright-image` fails CI
if the two ever differ, since the browser build baked into the image only pairs with the
matching library. It runs as a `playwright` service in `docker/docker-compose.yml`, on the
same network as the frontend, with the specs bind-mounted so editing a test doesn't rebuild
the image. `npm run test:visual` compares; `npm run test:visual:update` regenerates.

**It refuses to run anywhere else.** The image sets `PW_PINNED_IMAGE`; an auto fixture in
`tests/visual/visual-test.ts` throws with instructions when it is missing. A screenshot taken
on a developer machine would otherwise fail against CI's baselines, or silently replace them.

**Pages render from fixed stub data with the internet cut off.** Every scene installs
`mockApi` (`tests/support/api-mock.ts`), which answers the API from typed stubs
([0001](0001-api-mocking-strategy.md)), lets the app's own origin through, and blocks every
other origin. Locale, timezone, colour scheme and reduced motion are pinned in the project
config, and stub timestamps are UTC. An API call with no stub fails the test rather than
rendering a half-loaded page.

**No pixel tolerance.** The config sets none, so any differing pixel beyond Playwright's
default per-pixel colour threshold fails.

**Scenes are shared with the a11y suite** ([0010](0010-a11y-as-a-ratchet-on-recorded-violations.md)):
`tests/support/scenes.ts` lists the ten pages and states once, so the two suites cannot
drift apart on coverage. Baselines live in `tests/visual/scenes.spec.ts-snapshots/` as
`<scene>-visual-linux.png` and are reviewed as image diffs in a pull request.

## Evidence

- Five full repeats in the container with zero tolerance: 50 of 50 passed.
- Sensitivity: changing one stub value from 12 to 13 failed exactly the four scenes that
  display it, with **9 pixels** different. The earlier config, a 1% ratio, would have let
  that through — which is why there is no tolerance.
- Baselines were inspected by eye, not just generated: real layout, the wrapped long title,
  the signed-in header, and fixed dates such as "January 15, 2026".

## Consequences

**Positive**

- A diff means the app's markup or styling changed. It cannot be the machine, the network,
  the database or the clock.
- The suite needs no backend data, so it is fast (about 10 seconds for ten scenes) and can't
  be broken by another test.
- The guard turns a subtle failure mode (wrong-environment baselines) into an immediate,
  explained error.

**Negative**

- **Less faithful than production.** With the external stylesheets blocked, text renders in
  the image's fallback fonts and icon glyphs are absent, so the screenshots do not show
  production typography or icons, and a regression in the icon font would not be caught.
  The alternative is vendoring those assets into the test setup (binary files and their
  licences to carry); it is a reasonable follow-up, not done here.
- **It doesn't exercise the backend.** Stubs are typed from the OpenAPI schema, which stops
  a stub drifting from the declared shapes at compile time, but nothing checks at run time
  that the real API still returns them. That coverage belongs to the `ui` suite.
- **Bumping Playwright regenerates every baseline**, because a new browser build renders
  slightly differently. The bump is `package.json` and the Dockerfile tag together, then
  `npm run test:visual:update`, then a reviewed diff.
- **CI cost and quirks.** The runner image is 3.84 GB on disk (the Playwright base plus our
  dependencies), so a cold runner has a sizeable download before the visual step starts; the
  cost on CI hasn't been measured yet. On a Linux host the
  container writes results as root into bind-mounted directories, so the workflow reclaims
  ownership afterwards. `docker compose run` also starts the whole application stack
  because the frontend depends on the backend, although the suite only needs the frontend.
- **Cross-machine determinism is established by construction (one image), not yet by
  measurement on CI.** Local repeats agree; the first CI run is the real cross-machine test.

## Alternatives considered

- **A baseline per operating system** — rejected. Three sets of images to keep in step, and
  each machine's differences become part of the contract.
- **The real backend with masking of dynamic regions** — rejected. Masked regions hide
  content from the comparison, and random usernames change layout width, which masks can't
  fix. Fixed stubs remove the variation instead of hiding it.
- **Tests on the host driving a browser in a container** (`playwright run-server`) —
  rejected as more moving parts (version coupling, and the remote browser has to reach the
  host's app) for no gain over running the tests in the container.
- **A hosted visual-testing service** — out of scope for a self-contained portfolio, and it
  would move the baselines out of the repository.
- **Tolerating a small pixel ratio** — rejected on the evidence above.
