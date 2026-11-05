// @ts-check
// Makes sure `.env` exists and holds a signing key for the backend's JWTs. The pinned backend
// (docker/docker-compose.yml) refuses to start without a real one: base64, at least 32 random
// bytes, no placeholders. So there is no usable default to commit, and every machine and every CI
// run makes its own. This is the one place that knows how.
//
// - A missing `.env` is created from `.env.example`.
// - A blank or absent JWT_SIGNING_KEY gets a fresh random key. A key that is already there is left
//   exactly as it is, so re-running is safe.
// - The key is written to `.env` only: never to `.env.example`, and never printed.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Anchored, so a commented-out example and a longer name (JWT_SIGNING_KEY_OLD) don't count. The
// optional \r keeps a Windows line ending exactly as it was.
const KEY_LINE = /^JWT_SIGNING_KEY=(.*?)(\r?)$/m;

/** 32 random bytes as base64: the shortest key the backend accepts. */
export function newSigningKey() {
  return randomBytes(32).toString('base64');
}

/** Nothing, only spaces, or an empty pair of quotes. */
const isBlank = (/** @type {string} */ value) => value.trim().replace(/^(['"])\1$/, '') === '';

/**
 * The text of an env file with a signing key in it. `makeKey` is only called when one is needed.
 * @param {string} text
 * @param {() => string} makeKey
 * @returns {{ text: string, keyWritten: boolean }}
 */
export function withSigningKey(text, makeKey) {
  const match = KEY_LINE.exec(text);
  if (match) {
    if (!isBlank(match[1] ?? '')) return { text, keyWritten: false };
    const key = makeKey();
    return {
      text: text.replace(KEY_LINE, (_line, _value, cr) => `JWT_SIGNING_KEY=${key}${cr}`),
      keyWritten: true,
    };
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const separator = text === '' || text.endsWith('\n') ? '' : eol;
  return { text: `${text}${separator}JWT_SIGNING_KEY=${makeKey()}${eol}`, keyWritten: true };
}

/**
 * @param {{ dir: string, makeKey?: () => string }} options `dir` holds `.env` and `.env.example`.
 * @returns {{ created: boolean, keyWritten: boolean }} What happened. Never the key.
 */
export function setupEnv({ dir, makeKey = newSigningKey }) {
  const envPath = join(dir, '.env');
  const examplePath = join(dir, '.env.example');
  const created = !existsSync(envPath);
  if (created && !existsSync(examplePath)) {
    throw new Error(`${examplePath} not found, so there is nothing to create .env from`);
  }

  const { text, keyWritten } = withSigningKey(
    readFileSync(created ? examplePath : envPath, 'utf8'),
    makeKey,
  );
  // The key is a secret: a new file is readable by its owner only (POSIX; ignored on Windows).
  if (created || keyWritten) writeFileSync(envPath, text, { mode: 0o600 });
  return { created, keyWritten };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const { created, keyWritten } = setupEnv({ dir: root });
    console.log(created ? '.env created from .env.example' : '.env already exists');
    console.log(
      keyWritten
        ? 'JWT_SIGNING_KEY: generated a random key (not printed)'
        : 'JWT_SIGNING_KEY: already set, left as it is',
    );
  } catch (error) {
    console.error(`setup-env: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
