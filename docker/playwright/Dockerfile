# syntax=docker/dockerfile:1
#
# The image the visual suite runs in, locally and in CI. Screenshot baselines are only
# comparable if the browser build, fonts and OS libraries are identical every time, so the
# tag is pinned to the exact @playwright/test version (`npm run check:playwright-image`
# fails the build if the two ever drift apart). See docs/adr/0009-visual-regression-in-a-pinned-image.md.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /work

# Dependencies only. The specs, page objects and config are bind-mounted at run time (see
# docker/docker-compose.yml) so editing a test doesn't mean rebuilding this image.
COPY package.json package-lock.json ./
RUN npm ci

# Marks "we are in the pinned image" — visual specs refuse to run without it.
ENV PW_PINNED_IMAGE=1

CMD ["npx", "playwright", "test", "--project=visual"]
