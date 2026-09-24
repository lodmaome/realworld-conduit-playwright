# syntax=docker/dockerfile:1
#
# The Angular frontend ships no Dockerfile of its own, so this one is ours to
# maintain. It clones the pinned upstream commit, patches the one thing that blocks
# pointing it at a self-hosted backend (a hardcoded API origin), and serves the
# static build output via nginx. See docs/adr/0005-frontend-custom-docker-build.md.

FROM oven/bun:1 AS build
WORKDIR /src

# git isn't in the base image; needed for the clone + submodule checkout below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG FRONTEND_REF
RUN test -n "$FRONTEND_REF" || (echo "FRONTEND_REF build arg is required" && exit 1)
RUN git clone https://github.com/realworld-apps/angular-realworld-example-app.git . \
    && git checkout "${FRONTEND_REF}" \
    && git submodule update --init --recursive

# The app's theme CSS and SVG assets live in the "realworld" submodule and are wired
# into angular.json by relative path — the submodule checkout above is required for
# the build to succeed, not just for its own test suite.

ARG API_BASE_URL=http://localhost:8080/api
# api.interceptor.ts hardcodes https://api.realworld.show/api with no env/runtime
# override (verified against the pinned commit). Patched here instead of forking the
# app. If a future FRONTEND_REF bump refactors this file, this sed will silently
# match nothing rather than fail loudly — re-verify the patch still takes effect
# whenever the pin is bumped.
RUN sed -i "s#https://api.realworld.show/api#${API_BASE_URL}#" \
    src/app/core/interceptors/api.interceptor.ts

RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:1.27-alpine
COPY --from=build /src/dist/angular-conduit/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
