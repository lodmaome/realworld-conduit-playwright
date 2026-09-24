import { test, expect } from '../fixtures/base';

test(
  'a newly registered user can fetch their own profile with the token they received',
  { tag: '@smoke' },
  async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const currentUser = await apiClient.getCurrentUser(user.token);

    expect(currentUser.username).toBe(user.username);
    expect(currentUser.email).toBe(user.email);
  },
);
