import { faker } from '@faker-js/faker';
import type { ApiClient, RegisterInput, User } from '../api-client/client';

export type NewUserOverrides = Partial<RegisterInput>;

// The API never returns the password, but UI login tests need it.
export type CreatedUser = User & { password: string };

/**
 * Builds globally-unique user credentials without touching the network — for tests
 * that register through the UI. Never reuse a fixed/seeded username here: unique data
 * per call is what keeps tests safe to run fully parallel.
 */
export function buildUser(overrides: NewUserOverrides = {}): RegisterInput {
  const unique = faker.string.alphanumeric({ length: 8, casing: 'lower' });

  return {
    username:
      overrides.username ?? `${faker.internet.username().replace(/[^a-zA-Z0-9]/g, '')}_${unique}`,
    email: overrides.email ?? `${unique}@example.test`,
    password: overrides.password ?? faker.internet.password({ length: 12 }),
  };
}

export async function createUser(
  apiClient: ApiClient,
  overrides: NewUserOverrides = {},
): Promise<CreatedUser> {
  const input = buildUser(overrides);
  const user = await apiClient.register(input);
  return { ...user, password: input.password };
}
