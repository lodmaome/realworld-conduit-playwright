const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Accessible-name matcher for buttons that pair an icon-font glyph with text
 * (`<i class="ion-heart"></i> Favorite Article`). The glyph is CSS-generated content
 * that Chromium folds into the accessible name, so the name reads
 * `"<glyph> Favorite Article (0)"` — an `exact: true` or `^`-anchored match can never succeed.
 *
 * Matches `label` as a whole word run instead: preceded by the start or a non-word
 * character (the glyph), not followed by more word characters. That keeps `Follow bob`
 * from matching `Unfollow bob` or `Follow bobby`, which a plain substring match would.
 */
export const iconLabel = (label: string): RegExp =>
  new RegExp(`(?:^|\\W)${escapeRegExp(label)}(?!\\w)`);
