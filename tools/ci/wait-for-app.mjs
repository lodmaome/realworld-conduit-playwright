// @ts-check
// Blocks until the Dockerized frontend and backend answer, or fails after a timeout.
//
// This is polled from outside on purpose: we don't control either upstream image, so we
// can't assume curl/wget exists for a compose HEALTHCHECK (see docker/docker-compose.yml).
// "Container started" is not "app ready" — the backend creates its SQLite schema before
// it starts listening, so a 200 from its Swagger document also means the database is up.

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080/api';
const frontendUrl = process.env.FRONTEND_BASE_URL ?? 'http://localhost:4200/';
const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS ?? 180_000);
const pollIntervalMs = 1_000;

const targets = [
  { name: 'backend', url: new URL('/swagger/v1/swagger.json', apiBaseUrl).href },
  { name: 'frontend', url: frontendUrl },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {Promise<string | null>} null when ready, otherwise why it isn't */
async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return response.ok ? null : `HTTP ${response.status}`;
  } catch (error) {
    if (!(error instanceof Error)) return String(error);
    // fetch wraps the socket error as `cause`; with several resolved addresses (IPv4 +
    // IPv6) that cause is an AggregateError holding the real codes.
    const cause = /** @type {any} */ (error.cause);
    return cause?.code ?? cause?.errors?.[0]?.code ?? cause?.message ?? error.message;
  }
}

async function waitFor({ name, url }) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const reason = await probe(url);
    if (reason === null) {
      console.log(`ready: ${name} (${url})`);
      return null;
    }
    if (Date.now() + pollIntervalMs > deadline) {
      return `${name} (${url}) not ready after ${timeoutMs}ms: ${reason}`;
    }
    await sleep(pollIntervalMs);
  }
}

const failures = (await Promise.all(targets.map(waitFor))).filter(Boolean);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}
