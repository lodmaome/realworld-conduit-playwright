// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anchorsOf, extractLinks, findBrokenLinks, slugify } from './links.mjs';

const check = (files, existing = []) =>
  findBrokenLinks(
    new Map(Object.entries(files)),
    (path) => existing.includes(path) || path in files,
  );

describe('slugify', () => {
  it('follows the GitHub rule', () => {
    assert.equal(slugify('Flaky tests'), 'flaky-tests');
    assert.equal(slugify('Quarantining a test'), 'quarantining-a-test');
    assert.equal(slugify('The `check:tags` rules'), 'the-checktags-rules');
    assert.equal(slugify('Decision: what, why?'), 'decision-what-why');
  });
});

describe('anchorsOf', () => {
  it('collects headings at any level, ignoring those in code fences', () => {
    const md = '# One\n\n## Two words\n\n```\n# not a heading\n```\n\n### Three ###\n';
    assert.deepEqual([...anchorsOf(md)], ['one', 'two-words', 'three']);
  });
});

describe('extractLinks', () => {
  it('finds links with their line numbers', () => {
    assert.deepEqual(extractLinks('text\n[a](x.md) and [b](y.md#z)\n'), [
      { target: 'x.md', line: 2 },
      { target: 'y.md#z', line: 2 },
    ]);
  });
  it('ignores links inside code fences and inline code', () => {
    assert.deepEqual(extractLinks('`[a](nope.md)`\n```\n[b](nope.md)\n```\n'), []);
  });
});

describe('findBrokenLinks', () => {
  it('accepts links to files that exist and headings that exist', () => {
    const problems = check({
      'README.md': '[doc](docs/a.md#the-heading)',
      'docs/a.md': '# The heading\n',
    });
    assert.deepEqual(problems, []);
  });

  it('reports a missing file, with where it was written', () => {
    const [problem] = check({ 'README.md': 'x\n[doc](docs/missing.md)' });
    assert.match(
      problem ?? '',
      /README\.md:2: "docs\/missing\.md" points at a file that doesn't exist/,
    );
  });

  it('reports a missing heading in an existing file', () => {
    const [problem] = check({ 'README.md': '[doc](docs/a.md#nope)', 'docs/a.md': '# Real\n' });
    assert.match(problem ?? '', /no heading "#nope" in docs\/a\.md/);
  });

  it('resolves links relative to the file they are written in', () => {
    const files = {
      'docs/adr/0001.md': '[strategy](../test-strategy.md)',
      'docs/test-strategy.md': '# S\n',
    };
    assert.deepEqual(check(files), []);
  });

  it('checks same-file anchors', () => {
    assert.deepEqual(check({ 'a.md': '# Top\n[up](#top)' }), []);
    assert.equal(check({ 'a.md': '# Top\n[up](#gone)' }).length, 1);
  });

  it('leaves external links alone', () => {
    assert.deepEqual(check({ 'a.md': '[x](https://example.test/y) [m](mailto:a@b.c)' }), []);
  });

  it('accepts a link to a directory or non-Markdown file that exists', () => {
    assert.deepEqual(
      check({ 'a.md': '[dir](tests/) [cfg](playwright.config.ts)' }, [
        'tests',
        'playwright.config.ts',
      ]),
      [],
    );
  });
});
