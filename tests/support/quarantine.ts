/**
 * Marks a test as quarantined: known to be unreliable, held out of the gating tiers, and
 * still run (non-blocking) every night so its stability stays visible.
 *
 * A quarantine must say why and until when — the reason and expiry live on the test
 * itself, and `npm run check:tags` fails once the date passes, so a quarantine can't
 * quietly become permanent. To extend one, change the date in a reviewed change.
 *
 *   test('shows the feed', quarantined('2026-11-15', 'flaky on slow runners, see #12'), async ({ page }) => { ... });
 *
 * See docs/adr/0012-flake-handling.md.
 */
export function quarantined(until: string, reason: string) {
  return {
    tag: '@quarantine',
    annotation: { type: 'quarantine', description: `until ${until}: ${reason}` },
  };
}
