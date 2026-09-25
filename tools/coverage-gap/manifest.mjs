// @ts-check
// The endpoint manifest: every operation (method + path) the backend's OpenAPI contract
// declares, read from the committed `api-client/schema.d.ts` that openapi-typescript generates.
//
// The file is parsed with the TypeScript compiler, not with regular expressions: it is the
// shape of a type, and a regex would break on the first nested brace.
//
// Each operation gets a fingerprint covering its own definition AND every schema it refers to,
// however deeply. A change to `ArticleEnvelope` changes the endpoints that return it even though
// their own text is untouched, and those are exactly the ones worth re-testing.
import { createHash } from 'node:crypto';
import ts from 'typescript';

/**
 * @typedef {object} Operation
 * @property {string} key         `METHOD /path`, the identity used everywhere else.
 * @property {string} method      Upper case.
 * @property {string} path        The template, as declared: `/api/articles/{slug}`.
 * @property {string} fingerprint Hash of the operation and the schemas it uses.
 */

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const SCHEMA_REF = /components\["schemas"\]\["([^"]+)"\]/g;

/** @param {ts.Node} name */
function nameOf(name) {
  return ts.isStringLiteral(name) || ts.isIdentifier(name) ? name.text : undefined;
}

/** Members of an `interface` or an object type literal, by name. */
function membersByName(/** @type {readonly ts.TypeElement[]} */ members) {
  /** @type {Map<string, ts.PropertySignature>} */
  const byName = new Map();
  for (const member of members) {
    const name = ts.isPropertySignature(member) ? nameOf(member.name) : undefined;
    if (name !== undefined && ts.isPropertySignature(member)) byName.set(name, member);
  }
  return byName;
}

/** Comments are documentation, not contract: a reworded description must not read as a change. */
const withoutComments = (/** @type {string} */ text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

const hash = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex');

/**
 * @param {string} source The text of a generated `schema.d.ts`.
 * @returns {Map<string, Operation>} Keyed by `METHOD /path`.
 */
export function parseSchema(source) {
  const file = ts.createSourceFile('schema.d.ts', source, ts.ScriptTarget.Latest, true);

  /** @type {Map<string, ts.PropertySignature>} */
  let paths = new Map();
  /** @type {Map<string, ts.PropertySignature>} */
  let operations = new Map();
  /** @type {Map<string, string>} */
  const schemaText = new Map();

  for (const statement of file.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;
    const members = membersByName(statement.members);
    if (statement.name.text === 'paths') paths = members;
    if (statement.name.text === 'operations') operations = members;
    if (statement.name.text === 'components') {
      const schemas = members.get('schemas')?.type;
      if (schemas && ts.isTypeLiteralNode(schemas)) {
        for (const [name, member] of membersByName(schemas.members)) {
          if (member.type) schemaText.set(name, withoutComments(member.type.getText(file)));
        }
      }
    }
  }
  if (paths.size === 0) {
    throw new Error('No `paths` interface found: is this an openapi-typescript schema.d.ts?');
  }

  /** @type {Map<string, Operation>} */
  const found = new Map();
  for (const [path, item] of paths) {
    if (!item.type || !ts.isTypeLiteralNode(item.type)) continue;
    for (const [name, member] of membersByName(item.type.members)) {
      const method = name.toLowerCase();
      if (!HTTP_METHODS.has(method) || !member.type) continue;
      // `get?: never` is how the generator says "this path has no GET".
      if (member.type.kind === ts.SyntaxKind.NeverKeyword) continue;

      let type = member.type;
      // With operationIds the generator writes `operations["name"]` and defines it elsewhere.
      if (ts.isIndexedAccessTypeNode(type) && ts.isLiteralTypeNode(type.indexType)) {
        const id = ts.isStringLiteral(type.indexType.literal) ? type.indexType.literal.text : '';
        const referenced = operations.get(id)?.type;
        if (!referenced)
          throw new Error(`${method.toUpperCase()} ${path}: unknown operation "${id}"`);
        type = referenced;
      }

      const text = withoutComments(type.getText(file));
      const key = `${method.toUpperCase()} ${path}`;
      found.set(key, {
        key,
        method: method.toUpperCase(),
        path,
        fingerprint: hash([text, ...referencedSchemas(text, schemaText)].join('\n')),
      });
    }
  }
  return found;
}

/**
 * The text of every schema `text` refers to, following references out of those schemas in turn.
 * Sorted by name so the fingerprint doesn't depend on discovery order.
 * @param {string} text
 * @param {Map<string, string>} schemaText
 */
function referencedSchemas(text, schemaText) {
  /** @type {Set<string>} */
  const seen = new Set();
  const queue = [text];
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.pop());
    for (const [, name] of current.matchAll(SCHEMA_REF)) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      queue.push(schemaText.get(name) ?? '');
    }
  }
  return [...seen].sort().map((name) => `${name}=${schemaText.get(name) ?? '<missing>'}`);
}
