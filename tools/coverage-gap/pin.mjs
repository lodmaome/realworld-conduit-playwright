// @ts-check
// A backend pin bump is the event that changes the API contract, and the contract is only
// visible to this tool through `api-client/schema.d.ts`, which somebody has to regenerate
// (docs/maintenance.md). A bump without the regeneration looks like "nothing changed", which
// is the one answer this tool must not give quietly, so it is detected and called out.

export const BACKEND_REPO = 'aspnetcore-realworld-example-app';

/**
 * The commit each app repo is pinned to, from `context: <repo url>.git#<sha>` lines.
 * @param {string} composeText
 * @returns {Map<string, string>} repo name to sha
 */
export function readPins(composeText) {
  /** @type {Map<string, string>} */
  const pins = new Map();
  for (const [, repo, sha] of composeText.matchAll(
    /context:\s*\S*\/([^/\s]+?)\.git#([0-9a-f]{7,40})/g,
  )) {
    if (repo && sha) pins.set(repo, sha);
  }
  return pins;
}

/**
 * @param {string} baseCompose
 * @param {string} headCompose
 * @returns {{ from: string, to: string } | undefined} Set when the backend pin moved.
 */
export function backendPinChange(baseCompose, headCompose) {
  const from = readPins(baseCompose).get(BACKEND_REPO);
  const to = readPins(headCompose).get(BACKEND_REPO);
  return from && to && from !== to ? { from, to } : undefined;
}
