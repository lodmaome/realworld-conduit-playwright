// @ts-check
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { newSigningKey, setupEnv, withSigningKey } from './setup-env.mjs';

const KEY = 'a-key-for-the-test';
const makeKey = () => KEY;
const neverCalled = () => {
  throw new Error('makeKey must not be called when a key is already there');
};

describe('newSigningKey', () => {
  it('is 32 random bytes as base64, the shortest key the backend accepts', () => {
    const key = newSigningKey();

    assert.match(key, /^[A-Za-z0-9+/]+={0,2}$/);
    assert.equal(Buffer.from(key, 'base64').length, 32);
  });

  it('is different every time', () => {
    assert.notEqual(newSigningKey(), newSigningKey());
  });
});

describe('withSigningKey', () => {
  it('fills a blank key and leaves every other line alone', () => {
    const before = 'FRONTEND_PORT=4200\nJWT_SIGNING_KEY=\nBACKEND_PORT=8080\n';

    const result = withSigningKey(before, makeKey);

    assert.deepEqual(result, {
      text: `FRONTEND_PORT=4200\nJWT_SIGNING_KEY=${KEY}\nBACKEND_PORT=8080\n`,
      keyWritten: true,
    });
  });

  it('counts spaces and an empty pair of quotes as blank', () => {
    for (const blank of ['   ', '""', "''"]) {
      const result = withSigningKey(`JWT_SIGNING_KEY=${blank}\n`, makeKey);

      assert.equal(result.text, `JWT_SIGNING_KEY=${KEY}\n`, JSON.stringify(blank));
    }
  });

  it('leaves a key that is already there exactly as it is, and never makes another', () => {
    const before = 'JWT_SIGNING_KEY=mine-already\nBACKEND_PORT=8080\n';

    const result = withSigningKey(before, neverCalled);

    assert.deepEqual(result, { text: before, keyWritten: false });
  });

  it('adds the line when an older .env does not have it, with or without a final newline', () => {
    assert.equal(
      withSigningKey('BACKEND_PORT=8080\n', makeKey).text,
      `BACKEND_PORT=8080\nJWT_SIGNING_KEY=${KEY}\n`,
    );
    assert.equal(
      withSigningKey('BACKEND_PORT=8080', makeKey).text,
      `BACKEND_PORT=8080\nJWT_SIGNING_KEY=${KEY}\n`,
    );
    assert.equal(withSigningKey('', makeKey).text, `JWT_SIGNING_KEY=${KEY}\n`);
  });

  it('keeps Windows line endings, when it fills a line and when it adds one', () => {
    assert.equal(
      withSigningKey('A=1\r\nJWT_SIGNING_KEY=\r\nB=2\r\n', makeKey).text,
      `A=1\r\nJWT_SIGNING_KEY=${KEY}\r\nB=2\r\n`,
    );
    assert.equal(withSigningKey('A=1\r\n', makeKey).text, `A=1\r\nJWT_SIGNING_KEY=${KEY}\r\n`);
  });

  it('does not mistake a comment or a longer name for the key', () => {
    const before = '# JWT_SIGNING_KEY=from-the-docs\nJWT_SIGNING_KEY_OLD=x\n';

    const result = withSigningKey(before, makeKey);

    assert.equal(result.text, `${before}JWT_SIGNING_KEY=${KEY}\n`);
    assert.equal(result.keyWritten, true);
  });
});

describe('setupEnv', () => {
  /** @type {string} */
  let dir;
  const file = (/** @type {string} */ name) => join(dir, name);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'setup-env-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .env from .env.example with a key, and never touches the example', () => {
    const example = 'BACKEND_PORT=8080\nJWT_SIGNING_KEY=\n';
    writeFileSync(file('.env.example'), example);

    const result = setupEnv({ dir, makeKey });

    assert.deepEqual(result, { created: true, keyWritten: true });
    assert.equal(readFileSync(file('.env'), 'utf8'), `BACKEND_PORT=8080\nJWT_SIGNING_KEY=${KEY}\n`);
    assert.equal(readFileSync(file('.env.example'), 'utf8'), example);
  });

  it('keeps the key of an existing .env, byte for byte, and does not rewrite the file', () => {
    const existing = 'JWT_SIGNING_KEY=mine-already\n';
    writeFileSync(file('.env'), existing);
    writeFileSync(file('.env.example'), 'JWT_SIGNING_KEY=\n');

    const result = setupEnv({ dir, makeKey: neverCalled });

    assert.deepEqual(result, { created: false, keyWritten: false });
    assert.equal(readFileSync(file('.env'), 'utf8'), existing);
  });

  it('adds a key to an existing .env that has none, and keeps its other settings', () => {
    writeFileSync(file('.env'), 'BACKEND_PORT=9999\n');
    writeFileSync(file('.env.example'), 'BACKEND_PORT=8080\nJWT_SIGNING_KEY=\n');

    const result = setupEnv({ dir, makeKey });

    assert.deepEqual(result, { created: false, keyWritten: true });
    assert.equal(readFileSync(file('.env'), 'utf8'), `BACKEND_PORT=9999\nJWT_SIGNING_KEY=${KEY}\n`);
  });

  it('says what happened and never returns the key', () => {
    writeFileSync(file('.env.example'), 'JWT_SIGNING_KEY=\n');

    const result = setupEnv({ dir, makeKey });

    assert.equal(JSON.stringify(result).includes(KEY), false);
  });

  it('fails clearly, and writes nothing, when there is no .env and no example', () => {
    assert.throws(() => setupEnv({ dir, makeKey }), /\.env\.example not found/);
    assert.equal(existsSync(file('.env')), false);
  });
});
