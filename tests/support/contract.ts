import { expect } from '@playwright/test';
import type { ApiResult } from '@api-client/client';
import { checkResponse, type ContractSource } from '@api-client/contract';

/**
 * Asserts a response matches the contract for `operation` (`METHOD /path/{param}` as the spec
 * declares it) and the status it actually carries. Failure says which operation, which status,
 * whether the schema was the published spec or our own supplement, and each violation.
 *
 * Pass `source` to also pin where the schema came from: `'supplement'` on a response the spec
 * doesn't cover makes the gap visible in the test, not just in contract.ts.
 */
export function expectContract(
  operation: string,
  result: ApiResult,
  { source }: { source?: ContractSource } = {},
): void {
  const check = checkResponse(operation, result.status, result.body);
  expect(
    check.errors,
    `${operation} answered ${result.status}; body does not match the ${check.source} schema`,
  ).toEqual([]);
  if (source)
    expect(check.source, `${operation} ${result.status}: where the schema came from`).toBe(source);
}
