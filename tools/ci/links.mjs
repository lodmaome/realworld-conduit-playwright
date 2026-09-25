// @ts-check
// Finds broken relative links in Markdown: a path that doesn't exist, or a `#section` that
// isn't a heading in the target. Pure functions over file contents, so they can be tested;
// check-links.mjs supplies the real files.
//
// Paths are repo-relative with forward slashes, resolved with POSIX rules on every platform:
// the OS `path` module would anchor them at a Windows drive root and get them wrong.
import { posix } from 'node:path';

/** GitHub's heading-to-anchor rule: lowercase, drop punctuation, spaces to hyphens. */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replaceAll(/`/g, '')
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replaceAll(/\s/g, '-');
}

/** @param {string} markdown @returns {Set<string>} */
export function anchorsOf(markdown) {
  const anchors = new Set();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = !inFence && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) anchors.add(slugify(heading[1] ?? ''));
  }
  return anchors;
}

/**
 * Links outside code fences and inline code, as { target, line }.
 * @param {string} markdown
 */
export function extractLinks(markdown) {
  /** @type {{ target: string, line: number }[]} */
  const links = [];
  let inFence = false;
  markdown.split('\n').forEach((raw, index) => {
    if (/^\s*```/.test(raw)) inFence = !inFence;
    if (inFence) return;
    const text = raw.replaceAll(/`[^`]*`/g, '');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      links.push({ target: match[1] ?? '', line: index + 1 });
    }
  });
  return links;
}

/**
 * @param {Map<string, string>} files repo-relative path (forward slashes) -> contents
 * @param {(path: string) => boolean} exists whether a repo-relative path exists (file or directory)
 * @returns {string[]} one message per broken link
 */
export function findBrokenLinks(files, exists) {
  const problems = [];
  for (const [file, markdown] of files) {
    for (const { target, line } of extractLinks(markdown)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, ...
      const [pathPart = '', fragment] = target.split('#');
      const resolved =
        pathPart === '' ? file : posix.normalize(posix.join(posix.dirname(file), pathPart));
      const where = `${file}:${line}`;

      if (pathPart !== '') {
        const outside = resolved.startsWith('../');
        const path = resolved.replace(/\/$/, '');
        if (outside || !exists(path)) {
          problems.push(`${where}: "${target}" points at a file that doesn't exist`);
          continue;
        }
      }
      if (fragment && resolved.endsWith('.md')) {
        const content = files.get(resolved);
        if (content !== undefined && !anchorsOf(content).has(fragment)) {
          problems.push(`${where}: "${target}" — no heading "#${fragment}" in ${resolved}`);
        }
      }
    }
  }
  return problems;
}
