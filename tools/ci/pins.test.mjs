// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { checkPins } from './pin-drift.mjs';
import {
  attentionSummary,
  evaluatePin,
  needsAttention,
  readAppPins,
  renderDriftReport,
  withOverrides,
} from './pins.mjs';

const NOW = new Date('2026-09-26T12:00:00Z');
const BACKEND = { name: /** @type {const} */ ('backend'), repo: 'acme/api', sha: 'a'.repeat(40) };
const FRONTEND = { name: /** @type {const} */ ('frontend'), repo: 'acme/web', sha: 'b'.repeat(40) };
const TIP = { sha: 'c'.repeat(40), date: '2026-09-25T10:00:00Z' };

/** @param {number} daysAgo @param {string} subject */
const commit = (daysAgo, subject = 'change') => ({
  sha: `${daysAgo}`.padStart(2, '0').repeat(20),
  commit: {
    message: subject,
    committer: { date: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() },
  },
});

/** @param {Partial<Parameters<typeof evaluatePin>[0]>} over */
const evaluate = (over = {}) =>
  evaluatePin({
    pin: BACKEND,
    defaultBranch: 'main',
    tip: TIP,
    pinDate: '2026-05-01T00:00:00Z',
    compare: { status: 'identical', ahead_by: 0, behind_by: 0 },
    now: NOW,
    ...over,
  });

describe('readAppPins', () => {
  const compose = `
services:
  backend:
    build:
      context: https://github.com/acme/api.git#${'a'.repeat(40)}
  frontend:
    build:
      args:
        FRONTEND_REF: ${'b'.repeat(40)}
`;
  const dockerfile = 'RUN git clone https://github.com/acme/web.git . \\\n && git checkout x';

  it('reads the backend from its build context and the frontend from its ref and clone URL', () => {
    assert.deepEqual(readAppPins({ compose, frontendDockerfile: dockerfile }), [BACKEND, FRONTEND]);
  });

  it("reads this repository's real files", () => {
    const pins = readAppPins({
      compose: readFileSync('docker/docker-compose.yml', 'utf8'),
      frontendDockerfile: readFileSync('docker/frontend/Dockerfile', 'utf8'),
    });
    assert.deepEqual(
      pins.map((p) => [p.name, p.repo]),
      [
        ['backend', 'realworld-apps/aspnetcore-realworld-example-app'],
        ['frontend', 'realworld-apps/angular-realworld-example-app'],
      ],
    );
    assert.ok(pins.every((p) => /^[0-9a-f]{40}$/.test(p.sha)));
  });

  it('says which pin it could not find, rather than guessing', () => {
    assert.throws(
      () => readAppPins({ compose: 'nothing', frontendDockerfile: dockerfile }),
      /No backend pin/,
    );
    assert.throws(
      () =>
        readAppPins({
          compose: compose.replace('FRONTEND_REF', 'OTHER'),
          frontendDockerfile: dockerfile,
        }),
      /No frontend pin/,
    );
    assert.throws(() => readAppPins({ compose, frontendDockerfile: 'FROM node' }), /git clone/);
  });
});

describe('withOverrides', () => {
  it('replaces the named pin and leaves the other alone', () => {
    const [backend, frontend] = withOverrides([BACKEND, FRONTEND], ['backend=abc1234']);
    assert.equal(backend?.sha, 'abc1234');
    assert.equal(frontend?.sha, FRONTEND.sha);
  });

  it('refuses a name or a value that is not a pin', () => {
    for (const bad of ['backend=main', 'database=abc1234', 'backend', 'backend=', 'backend=xyz']) {
      assert.throws(() => withOverrides([BACKEND, FRONTEND], [bad]), /Bad --pin/, bad);
    }
  });
});

describe('evaluatePin', () => {
  it('is current when the pin is the tip', () => {
    const result = evaluate();
    assert.equal(result.state, 'current');
    assert.equal(needsAttention(result), false);
  });

  it('is behind but recent while the oldest unpicked commit is within the threshold', () => {
    const result = evaluate({
      compare: { status: 'ahead', ahead_by: 2, behind_by: 0, commits: [commit(10), commit(2)] },
    });
    assert.equal(result.state, 'recent');
    assert.equal(result.behind, 2);
    assert.equal(result.oldestMissingDays, 10);
    assert.equal(needsAttention(result), false);
  });

  it('drifts only once the oldest unpicked commit is OLDER than the threshold', () => {
    const at = (days) =>
      evaluate({ compare: { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(days)] } })
        .state;
    assert.equal(at(30), 'recent', 'exactly at the threshold is not drift');
    assert.equal(at(31), 'drifted');
  });

  it('honours a different threshold', () => {
    const compare = { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(20)] };
    assert.equal(evaluate({ compare, maxAgeDays: 14 }).state, 'drifted');
    assert.equal(evaluate({ compare, maxAgeDays: 60 }).state, 'recent');
  });

  it('judges by the OLDEST unpicked commit, not the newest', () => {
    const compare = {
      status: 'ahead',
      ahead_by: 2,
      behind_by: 0,
      commits: [commit(90), commit(1)],
    };
    assert.equal(evaluate({ compare }).state, 'drifted');
  });

  it('flags a pin that is not an ancestor of the tip as diverged', () => {
    const result = evaluate({
      compare: { status: 'diverged', ahead_by: 3, behind_by: 2, commits: [commit(1)] },
    });
    assert.equal(result.state, 'diverged');
    assert.equal(needsAttention(result), true);
  });

  it('flags a commit upstream no longer has as missing', () => {
    const result = evaluate({ compare: undefined, pinDate: '' });
    assert.equal(result.state, 'missing');
    assert.equal(needsAttention(result), true);
  });

  it('lists the newest commits first, capped', () => {
    const commits = Array.from({ length: 15 }, (_, i) => commit(40 - i, `subject ${i}`));
    const result = evaluate({ compare: { status: 'ahead', ahead_by: 15, behind_by: 0, commits } });
    assert.equal(result.subjects.length, 10);
    assert.match(result.subjects[0] ?? '', /subject 14$/);
  });

  it('summarises where the changes are, biggest first, ties in a stable order', () => {
    const files = [
      'src/A/x.cs',
      'src/A/y.cs',
      'src/B/z.cs',
      'tests/T/t.cs',
      'README.md',
      'src/A/w.cs',
    ].map((filename) => ({ filename }));
    const result = evaluate({
      compare: { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(40)], files },
    });
    assert.deepEqual(result.areas, [
      { area: 'src/A', files: 3 },
      { area: 'README.md', files: 1 },
      { area: 'src/B', files: 1 },
      { area: 'tests/T', files: 1 },
    ]);
  });
});

describe('attentionSummary', () => {
  it('says what is wrong in each state that needs a look', () => {
    const drifted = evaluate({
      compare: { status: 'ahead', ahead_by: 4, behind_by: 0, commits: [commit(45)] },
    });
    assert.match(attentionSummary(drifted), /4 upstream commits unpicked, the oldest 45 days old/);
    assert.match(attentionSummary(evaluate({ compare: undefined })), /no longer exists upstream/);
    assert.match(
      attentionSummary(evaluate({ compare: { status: 'diverged', ahead_by: 1, behind_by: 1 } })),
      /history rewritten/,
    );
  });
});

describe('renderDriftReport', () => {
  const render = (/** @type {ReturnType<typeof evaluate>[]} */ results, extra = {}) =>
    renderDriftReport(results, { now: NOW, ...extra });

  it('says plainly when every pin is at its tip', () => {
    assert.ok(
      render([evaluate(), evaluate({ pin: FRONTEND })]).includes(
        'Every pin is at its upstream tip.',
      ),
    );
  });

  it('says a recent lag is not drift yet', () => {
    const recent = evaluate({
      compare: { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(3)] },
    });
    const text = render([recent]);
    assert.ok(text.includes('not drift yet'));
    assert.ok(!text.includes('### '));
  });

  it('shows a drifted pin with its compare link, its areas and its commits', () => {
    const drifted = evaluate({
      compare: {
        status: 'ahead',
        ahead_by: 1,
        behind_by: 0,
        commits: [commit(45, 'Fix the thing')],
        files: [{ filename: 'src/Api/Foo.cs' }],
      },
    });
    const text = render([drifted]);
    assert.ok(text.includes('### backend: drifted'));
    assert.ok(
      text.includes(`https://github.com/acme/api/compare/${'a'.repeat(40)}...${'c'.repeat(40)}`),
    );
    assert.ok(text.includes('`src/Api` (1)'));
    assert.ok(text.includes('Fix the thing'));
    assert.ok(text.includes('only reports'));
  });

  it('says a missing commit will break the build', () => {
    assert.ok(
      render([evaluate({ compare: undefined, pinDate: '' })]).includes('will fail the next time'),
    );
  });

  it('prefixes links into this repository so they resolve inside an issue', () => {
    const drifted = evaluate({
      compare: { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(45)] },
    });
    const text = render([drifted], { docsBase: 'https://github.com/o/r/blob/main/' });
    assert.ok(
      text.includes(
        '](https://github.com/o/r/blob/main/docs/adr/0002-pin-upstream-app-versions.md)',
      ),
    );
    assert.ok(text.includes('](https://github.com/o/r/blob/main/docs/maintenance.md#'));
  });

  it('does not put a raw placeholder in the output', () => {
    assert.ok(!render([evaluate()]).includes('${'));
  });
});

describe('checkPins', () => {
  /**
   * A fake GitHub: `commits` maps a ref to a response, `compare` maps a pin to one.
   * @param {{ [path: string]: { status: number, json?: any } }} routes
   */
  const fakeGithub = (routes) => {
    /** @type {string[]} */
    const asked = [];
    return {
      asked,
      fetchJson: async (/** @type {string} */ path) => {
        asked.push(path);
        return routes[path] ?? { status: 404, json: undefined };
      },
    };
  };
  const tipCommit = { sha: TIP.sha, commit: { committer: { date: TIP.date } } };
  const baseRoutes = {
    '/repos/acme/api': { status: 200, json: { default_branch: 'main' } },
    '/repos/acme/api/commits/main': { status: 200, json: tipCommit },
    [`/repos/acme/api/commits/${BACKEND.sha}`]: {
      status: 200,
      json: { sha: BACKEND.sha, commit: { committer: { date: '2026-05-01T00:00:00Z' } } },
    },
  };

  it('asks GitHub for the default branch, the tip, the pin, and the comparison', async () => {
    const github = fakeGithub({
      ...baseRoutes,
      [`/repos/acme/api/compare/${BACKEND.sha}...${TIP.sha}`]: {
        status: 200,
        json: { status: 'ahead', ahead_by: 1, behind_by: 0, commits: [commit(45)], files: [] },
      },
    });
    const [result] = await checkPins([BACKEND], { fetchJson: github.fetchJson, now: NOW });
    assert.equal(result?.state, 'drifted');
    assert.equal(result?.pinDate, '2026-05-01T00:00:00Z');
    assert.equal(github.asked.length, 4);
  });

  it('reports a pin GitHub does not have as missing, without comparing', async () => {
    for (const status of [404, 422]) {
      const github = fakeGithub({
        ...baseRoutes,
        [`/repos/acme/api/commits/${BACKEND.sha}`]: { status },
      });
      const [result] = await checkPins([BACKEND], { fetchJson: github.fetchJson, now: NOW });
      assert.equal(result?.state, 'missing', String(status));
      assert.ok(
        !github.asked.some((p) => p.includes('/compare/')),
        'no comparison for a missing commit',
      );
    }
  });

  it('fails the check on a server error or a rate limit, instead of reporting "no drift"', async () => {
    for (const status of [403, 429, 500, 502]) {
      const broken = fakeGithub({ '/repos/acme/api': { status } });
      await assert.rejects(
        checkPins([BACKEND], { fetchJson: broken.fetchJson, now: NOW }),
        new RegExp(String(status)),
      );
    }
    const pinLookupBroke = fakeGithub({
      ...baseRoutes,
      [`/repos/acme/api/commits/${BACKEND.sha}`]: { status: 500 },
    });
    await assert.rejects(
      checkPins([BACKEND], { fetchJson: pinLookupBroke.fetchJson, now: NOW }),
      /500/,
    );
  });

  it('checks every pin', async () => {
    const identical = { status: 200, json: { status: 'identical', ahead_by: 0, behind_by: 0 } };
    const github = fakeGithub({
      ...baseRoutes,
      [`/repos/acme/api/compare/${BACKEND.sha}...${TIP.sha}`]: identical,
      '/repos/acme/web': { status: 200, json: { default_branch: 'trunk' } },
      '/repos/acme/web/commits/trunk': { status: 200, json: tipCommit },
      [`/repos/acme/web/commits/${FRONTEND.sha}`]: {
        status: 200,
        json: { sha: FRONTEND.sha, commit: { committer: { date: '2026-05-01T00:00:00Z' } } },
      },
      [`/repos/acme/web/compare/${FRONTEND.sha}...${TIP.sha}`]: identical,
    });
    const results = await checkPins([BACKEND, FRONTEND], { fetchJson: github.fetchJson, now: NOW });
    assert.deepEqual(
      results.map((r) => [r.pin.name, r.defaultBranch, r.state]),
      [
        ['backend', 'main', 'current'],
        ['frontend', 'trunk', 'current'],
      ],
    );
  });
});
