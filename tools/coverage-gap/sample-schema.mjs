// @ts-check
// Builds a small schema in openapi-typescript's output shape, for the tests. Only what the
// parser reads is reproduced; the shape was taken from the real api-client/schema.d.ts.

/**
 * @param {object} spec
 * @param {Record<string, Record<string, string | null>>} spec.paths
 *   path -> method -> the schema name it returns, or null for `method?: never`.
 * @param {Record<string, string>} spec.schemas  name -> the schema's members, as TypeScript.
 * @param {string} [spec.comment] Put into a description comment on every operation.
 */
export function sampleSchema({ paths, schemas, comment = 'OK' }) {
  const operation = (/** @type {string} */ returns) => `{
            parameters: { query?: never; header?: never; path?: never; cookie?: never; };
            requestBody?: never;
            responses: {
                /** @description ${comment} */
                200: {
                    headers: { [name: string]: unknown; };
                    content: { "application/json": components["schemas"]["${returns}"]; };
                };
            };
        }`;
  const pathItems = Object.entries(paths).map(([path, methods]) => {
    const members = Object.entries(methods).map(([method, returns]) =>
      returns === null ? `${method}?: never;` : `${method}: ${operation(returns)};`,
    );
    return `    "${path}": {\n        parameters: { query?: never; };\n        ${members.join('\n        ')}\n    };`;
  });
  const schemaItems = Object.entries(schemas).map(
    ([name, members]) => `        "${name}": { ${members} };`,
  );
  return `export interface paths {\n${pathItems.join('\n')}\n}\nexport interface components {\n    schemas: {\n${schemaItems.join('\n')}\n    };\n    responses: never;\n}\n`;
}

/** A small API: a list, one thing, and a schema chain Thing -> Owner. */
export const baseSpec = {
  paths: {
    '/api/things': { get: 'ThingList', post: 'Thing', put: null },
    '/api/things/{id}': { get: 'Thing', delete: 'Thing' },
    '/api/things/latest': { get: 'Thing' },
    '/api/owners': { get: 'Owner' },
  },
  schemas: {
    ThingList: 'things: components["schemas"]["Thing"][]',
    Thing: 'id: number; name: string; owner: components["schemas"]["Owner"]',
    Owner: 'login: string',
  },
};
