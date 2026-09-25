import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import openapi from './openapi.json';

// Validates what the backend really sends against the OpenAPI contract, at run time. The
// generated types (schema.d.ts) are checked when the tests compile; they can't tell you that a
// response drifted from them. See docs/adr/0015-validate-responses-against-the-contract.md.
//
// The published spec is incomplete, and that shapes this file. It declares only `200` for every
// operation, and for five of them it declares no body at all, yet the backend answers 201, 204,
// 401, 403, 404, 409 and 422. So there are two sources of truth, and a check says which it used:
//
//   - `openapi`: a response schema the spec declares. This is the published contract.
//   - `supplement`: a schema WE wrote for something the spec is silent on, from observing the
//     backend (tests/api/spec-gaps.spec.ts fails if the spec starts covering it). It is our
//     assertion about the backend, not the contract, and is reported as such.
//
// A response with no schema from either source is an error, not a pass: an unknown status is
// something to decide about, not to ignore.

type Json = Record<string, unknown>;
type Operation = { responses?: Record<string, { content?: Record<string, { schema?: Json }> }> };
type Spec = { paths: Record<string, Record<string, Operation>>; components: Json };
const spec = openapi as unknown as Spec;

export type ContractSource = 'openapi' | 'supplement';
export type ContractCheck = { ok: boolean; source: ContractSource; errors: string[] };

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/**
 * The spec declares no `required` field anywhere: every property is optional, so a response
 * missing `token` would validate. These are the keys the backend was observed to always send
 * (probed on 2026-09-25, every endpoint that returns them). `body` is left off Article on
 * purpose: the backend omits it from list items, so tests of single-article endpoints assert it
 * themselves. tests/api/spec-gaps.spec.ts fails if the spec starts declaring `required`.
 */
const person = ['username', 'bio', 'image', 'following'];
const observedPresence: Record<string, string[]> = {
  'Conduit.Domain.Article': [
    'slug',
    'title',
    'description',
    'author',
    'comments',
    'createdAt',
    'updatedAt',
    'favorited',
    'favoritesCount',
    'tagList',
  ],
  'Conduit.Domain.Comment': ['id', 'body', 'author', 'createdAt', 'updatedAt'],
  'Conduit.Domain.Person': person,
  'Conduit.Features.Profiles.Profile': person,
  'Conduit.Features.Users.User': ['username', 'email', 'bio', 'image', 'token'],
  'Conduit.Features.Articles.ArticleEnvelope': ['article'],
  'Conduit.Features.Articles.ArticlesEnvelope': ['articles', 'articlesCount'],
  'Conduit.Features.Comments.CommentsEnvelope': ['comments'],
  'Conduit.Features.Profiles.ProfileEnvelope': ['profile'],
  'Conduit.Features.Tags.TagsEnvelope': ['tags'],
  'Conduit.Features.Users.UserEnvelope': ['user'],
};

/** The spec's components with the observed presence rules added. */
function withObservedPresence(components: Json): Json {
  const schemas = { ...(components.schemas as Record<string, Json>) };
  for (const [name, required] of Object.entries(observedPresence)) {
    const schema = schemas[name];
    if (!schema) throw new Error(`contract.ts: "${name}" is not a schema in openapi.json any more`);
    schemas[name] = {
      ...schema,
      required: [...((schema.required as string[]) ?? []), ...required],
    };
  }
  return { ...components, schemas };
}
const components = withObservedPresence(spec.components);

/** The body every 4xx answer has: `{ errors: { field: [messages] } }`. Not in the spec. */
const errorEnvelope: Json = {
  type: 'object',
  required: ['errors'],
  properties: {
    errors: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
  },
  additionalProperties: false,
};

/** What a successful create returns where the spec declares no body. Keyed `METHOD /path status`. */
const supplements: Record<string, Json> = {
  'POST /api/users 201': ref('Conduit.Features.Users.UserEnvelope'),
  'POST /api/articles 201': ref('Conduit.Features.Articles.ArticleEnvelope'),
  'POST /api/articles/{slug}/comments 201': {
    type: 'object',
    required: ['comment'],
    properties: { comment: ref('Conduit.Domain.Comment') },
    additionalProperties: false,
  },
};

// The two formats the spec uses (int32, date-time). Written here instead of pulling in
// ajv-formats for two checks; ajv would otherwise ignore them.
const formats = {
  int32: {
    type: 'number' as const,
    validate: (value: number) =>
      Number.isInteger(value) && value >= -2147483648 && value <= 2147483647,
  },
  'date-time': (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value)),
};

const ajv = new Ajv({ allErrors: true, strict: false, formats });
const compiled = new Map<string, ValidateFunction>();

function validatorFor(key: string, schema: Json): ValidateFunction {
  let validate = compiled.get(key);
  if (!validate) {
    // The components ride along on the root so `#/components/schemas/X` references resolve.
    validate = ajv.compile({ ...schema, components });
    compiled.set(key, validate);
  }
  return validate;
}

const describeError = (error: ErrorObject) => {
  const extra =
    error.keyword === 'additionalProperties' ? ` "${String(error.params.additionalProperty)}"` : '';
  return `${error.instancePath || '(body)'} ${error.message ?? 'is invalid'}${extra}`;
};

/** Where the schema for `operation` (`METHOD /path/{param}`) and `status` comes from, if anywhere. */
function schemaFor(
  operation: string,
  status: number,
): { schema: Json; source: ContractSource } | 'empty' | undefined {
  const [method = '', path = ''] = operation.split(' ');
  const declared = spec.paths[path]?.[method.toLowerCase()];
  if (!declared) throw new Error(`"${operation}" is not an operation in api-client/openapi.json`);

  const fromSpec = declared.responses?.[String(status)]?.content?.['application/json']?.schema;
  if (fromSpec) return { schema: fromSpec, source: 'openapi' };

  const supplement = supplements[`${operation} ${status}`];
  if (supplement) return { schema: supplement, source: 'supplement' };
  if (status === 204) return 'empty';
  if (status >= 400 && status < 500) return { schema: errorEnvelope, source: 'supplement' };
  return undefined;
}

/**
 * Checks a response body against the contract. `operation` is `METHOD /path/{param}` exactly as
 * declared in the spec, e.g. `GET /api/articles/{slug}`.
 */
export function checkResponse(operation: string, status: number, body: unknown): ContractCheck {
  const found = schemaFor(operation, status);
  if (found === undefined) {
    throw new Error(
      `No schema for ${operation} answering ${status}: the spec doesn't declare it and there is ` +
        'no supplement. Decide what the response should look like and add it in contract.ts.',
    );
  }
  if (found === 'empty') {
    const empty = body === undefined || body === null || body === '';
    return { ok: empty, source: 'supplement', errors: empty ? [] : ['(body) should be empty'] };
  }
  const validate = validatorFor(`${operation} ${status}`, found.schema);
  const ok = validate(body) as boolean;
  return { ok, source: found.source, errors: ok ? [] : (validate.errors ?? []).map(describeError) };
}

/** The statuses the published spec declares for an operation, for tests about the spec itself. */
export function declaredStatuses(operation: string): string[] {
  const [method = '', path = ''] = operation.split(' ');
  return Object.keys(spec.paths[path]?.[method.toLowerCase()]?.responses ?? {});
}

/** Every `METHOD /path` in the spec. */
export function allOperations(): string[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) => ['get', 'put', 'post', 'delete', 'patch'].includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

/** Whether the published spec declares a JSON body for this response. */
export function specDeclaresBody(operation: string, status: number): boolean {
  const [method = '', path = ''] = operation.split(' ');
  return Boolean(
    spec.paths[path]?.[method.toLowerCase()]?.responses?.[String(status)]?.content?.[
      'application/json'
    ]?.schema,
  );
}

/** The `METHOD /path status` combinations we supplement because the spec doesn't declare them. */
export function supplementKeys(): string[] {
  return Object.keys(supplements);
}

/** Schemas we add presence rules to, for the test that checks the spec still has none. */
export function presenceSchemas(): string[] {
  return Object.keys(observedPresence);
}

/** Whether the published spec itself declares a `required` list on this schema. */
export function specRequires(schemaName: string): boolean {
  const schema = (spec.components.schemas as Record<string, Json>)[schemaName];
  return Array.isArray(schema?.required) && schema.required.length > 0;
}
