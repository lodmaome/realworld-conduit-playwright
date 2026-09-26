// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPublishBranch, isPublishBranch } from './publish-branch.mjs';

describe('isPublishBranch', () => {
  it('allows the real site branch', () => {
    assert.equal(isPublishBranch('gh-pages'), true);
  });

  it('allows a rehearsal branch named gh-pages-<something>', () => {
    for (const name of [
      'gh-pages-rehearsal',
      'gh-pages-flake-trial',
      'gh-pages-2026.09',
      'gh-pages-a',
    ]) {
      assert.equal(isPublishBranch(name), true, name);
    }
  });

  it('refuses the branches a force-push would wreck', () => {
    for (const name of ['main', 'master', 'develop', 'HEAD', 'refs/heads/main', '']) {
      assert.equal(isPublishBranch(name), false, `"${name}"`);
    }
  });

  it('refuses names that only look like the pattern', () => {
    for (const name of [
      'gh-pages-',
      'gh-pagesX',
      'gh-pages/x',
      'gh-pages-a/b',
      'gh-pages-..',
      'gh-pages-a..b',
      'gh-pages-a b',
      'gh-pages-a;rm -rf',
      'gh-pages-$(whoami)',
      'gh-pages-\nmain',
      'GH-PAGES',
      ' gh-pages',
      `gh-pages-${'a'.repeat(80)}`,
    ]) {
      assert.equal(isPublishBranch(name), false, JSON.stringify(name));
    }
  });
});

describe('assertPublishBranch', () => {
  it('returns an allowed name unchanged', () => {
    assert.equal(assertPublishBranch('gh-pages-rehearsal'), 'gh-pages-rehearsal');
  });

  it('throws, saying what is allowed, for anything else', () => {
    assert.throws(() => assertPublishBranch('main'), /Refusing to publish to "main"/);
    assert.throws(() => assertPublishBranch('main'), /gh-pages-<something>/);
  });
});
