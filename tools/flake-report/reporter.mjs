// @ts-check
// A Playwright reporter that records what happened to every test — in particular which
// ones failed and then passed on retry — so retries are reported instead of silently
// turning a red run green. One JSON file per Playwright invocation into flake-results/;
// `npm run test:full` makes three invocations, and the publish step merges them.
// See docs/adr/0012-flake-handling.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPart } from './record.mjs';

export default class FlakeReporter {
  /** @param {{ outputDir?: string }} [options] */
  constructor(options = {}) {
    this.outputDir = options.outputDir ?? 'flake-results';
    /** @type {any} */
    this.suite = undefined;
    this.startedAt = new Date();
  }

  // Quiet: the list reporter already owns the terminal.
  printsToStdio() {
    return false;
  }

  onBegin(_config, suite) {
    this.suite = suite;
    this.startedAt = new Date();
  }

  onEnd() {
    // A reporting failure must never change the outcome of the tests it is reporting on.
    try {
      const part = buildPart(this.suite, this.startedAt);
      mkdirSync(this.outputDir, { recursive: true });
      const name = `part-${Date.now()}-${process.pid}.json`;
      writeFileSync(join(this.outputDir, name), JSON.stringify(part));
    } catch (error) {
      console.warn(`flake reporter: could not write results (${error})`);
    }
  }
}
