// @ts-check
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backendPinChange, readPins } from './pin.mjs';

const compose = (
  /** @type {string} */ backend,
  /** @type {string} */ frontend = 'b'.repeat(40),
) => `
services:
  backend:
    build:
      context: https://github.com/realworld-apps/aspnetcore-realworld-example-app.git#${backend}
  frontend:
    build:
      context: https://github.com/realworld-apps/angular-realworld-example-app.git#${frontend}
`;

describe('readPins', () => {
  it('reads each repo and the commit it is pinned to', () => {
    const pins = readPins(compose('a'.repeat(40)));
    assert.equal(pins.get('aspnetcore-realworld-example-app'), 'a'.repeat(40));
    assert.equal(pins.get('angular-realworld-example-app'), 'b'.repeat(40));
  });
});

describe('backendPinChange', () => {
  it('reports the move of the backend pin', () => {
    assert.deepEqual(backendPinChange(compose('a'.repeat(40)), compose('c'.repeat(40))), {
      from: 'a'.repeat(40),
      to: 'c'.repeat(40),
    });
  });

  it('ignores a frontend-only change, which cannot change the API contract', () => {
    assert.equal(
      backendPinChange(
        compose('a'.repeat(40), 'b'.repeat(40)),
        compose('a'.repeat(40), 'd'.repeat(40)),
      ),
      undefined,
    );
  });

  it('reports nothing when the file was unreadable at the base', () => {
    assert.equal(backendPinChange('', compose('a'.repeat(40))), undefined);
  });
});
