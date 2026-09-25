import { buildUser } from '@factories/user-factory';
import { expect, test } from '../fixtures/base';
import { bodyOf, knownIssue, type ErrorBody, type UserBody } from '../support/api-shapes';
import { expectContract } from '../support/contract';

test.describe('registration', () => {
  test('returns 201 with the user and a token, and never the password', async ({ apiClient }) => {
    const input = buildUser();

    const res = await apiClient.send('POST', 'users', { data: { user: input } });

    expect(res.status).toBe(201);
    expectContract('POST /api/users', res, { source: 'supplement' });
    const { user } = bodyOf<UserBody>(res);
    expect(user).toMatchObject({
      username: input.username,
      email: input.email,
      bio: null,
      image: null,
    });
    expect(user.token).not.toBe('');
    expect(JSON.stringify(res.body)).not.toContain(input.password);
  });

  test('refuses a username that is taken, with 409', async ({ apiClient, userFactory }) => {
    const existing = await userFactory();

    const res = await apiClient.send('POST', 'users', {
      data: { user: buildUser({ username: existing.username }) },
    });

    expect(res.status).toBe(409);
    expectContract('POST /api/users', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ username: ['has already been taken'] });
  });

  test('refuses an email that is taken, with 409', async ({ apiClient, userFactory }) => {
    const existing = await userFactory();

    const res = await apiClient.send('POST', 'users', {
      data: { user: buildUser({ email: existing.email }) },
    });

    expect(res.status).toBe(409);
    expectContract('POST /api/users', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ email: ['has already been taken'] });
  });

  test('refuses blank fields with 422 and one message per problem', async ({ apiClient }) => {
    const res = await apiClient.send('POST', 'users', {
      data: { user: { username: '', email: '', password: '' } },
    });

    expect(res.status).toBe(422);
    expectContract('POST /api/users', res);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({
      username: ["can't be blank"],
      email: ["can't be blank"],
      password: ["can't be blank", 'is too short (minimum is 8 characters)'],
    });
  });

  test('refuses a password shorter than 8 characters', async ({ apiClient }) => {
    const res = await apiClient.send('POST', 'users', {
      data: { user: buildUser({ password: 'short' }) },
    });

    expect(res.status).toBe(422);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({
      password: ['is too short (minimum is 8 characters)'],
    });
  });

  test('refuses a request with no user object', async ({ apiClient }) => {
    const res = await apiClient.send('POST', 'users', { data: {} });

    expect(res.status).toBe(422);
    expectContract('POST /api/users', res);
    expect(Object.keys(bodyOf<ErrorBody>(res).errors)).toEqual(['User']);
  });
});

test.describe('signing in', () => {
  test('returns 200, the same user, and a token that works', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const res = await apiClient.send('POST', 'users/login', {
      data: { user: { email: user.email, password: user.password } },
    });

    expect(res.status).toBe(200);
    expectContract('POST /api/users/login', res, { source: 'openapi' });
    const { user: signedIn } = bodyOf<UserBody>(res);
    expect(signedIn).toMatchObject({ username: user.username, email: user.email });
    const current = await apiClient.send('GET', 'user', { token: signedIn.token });
    expect(current.status).toBe(200);
  });

  test('refuses a wrong password and an unknown email identically, so accounts cannot be probed', async ({
    apiClient,
    userFactory,
  }) => {
    const user = await userFactory();

    const wrongPassword = await apiClient.send('POST', 'users/login', {
      data: { user: { email: user.email, password: 'not-the-password-1' } },
    });
    const unknownEmail = await apiClient.send('POST', 'users/login', {
      data: { user: { email: buildUser().email, password: user.password } },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expectContract('POST /api/users/login', wrongPassword);
    expect(wrongPassword.body).toEqual({ errors: { credentials: ['invalid'] } });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test('refuses blank credentials with 422', async ({ apiClient }) => {
    const res = await apiClient.send('POST', 'users/login', {
      data: { user: { email: '', password: '' } },
    });

    expect(res.status).toBe(422);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({
      email: ["can't be blank"],
      password: ["can't be blank"],
    });
  });
});

test.describe('authentication', () => {
  test('GET /user returns the token holder', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const res = await apiClient.send('GET', 'user', { token: user.token });

    expect(res.status).toBe(200);
    expectContract('GET /api/user', res, { source: 'openapi' });
    expect(bodyOf<UserBody>(res).user.username).toBe(user.username);
  });

  test('a request with no token is refused with 401', async ({ apiClient }) => {
    const res = await apiClient.send('GET', 'user');

    expect(res.status).toBe(401);
    expectContract('GET /api/user', res);
    expect(res.body).toEqual({ errors: { token: ['is missing'] } });
  });

  test('accepts both the Token and the Bearer scheme', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const asToken = await apiClient.send('GET', 'user', { authorization: `Token ${user.token}` });
    const asBearer = await apiClient.send('GET', 'user', { authorization: `Bearer ${user.token}` });

    expect(asToken.status).toBe(200);
    expect(asBearer.status).toBe(200);
  });

  test('refuses a token with no scheme in front of it', async ({ apiClient, userFactory }) => {
    const user = await userFactory();

    const res = await apiClient.send('GET', 'user', { authorization: user.token });

    expect(res.status).toBe(401);
  });

  test('refuses a token that is not a token', async ({ apiClient }) => {
    const res = await apiClient.send('GET', 'user', { token: 'not-a-token' });

    expect(res.status).toBe(401);
    expectContract('GET /api/user', res);
  });
});

test.describe('updating the account', () => {
  test('changes the bio and image, returns the user, and is remembered', async ({
    apiClient,
    userFactory,
  }) => {
    const user = await userFactory();
    const image = 'https://example.test/me.png';

    const res = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { bio: 'I write tests', image } },
    });

    expect(res.status).toBe(200);
    expectContract('PUT /api/user', res, { source: 'openapi' });
    expect(bodyOf<UserBody>(res).user).toMatchObject({ bio: 'I write tests', image });
    const current = await apiClient.send('GET', 'user', { token: user.token });
    expect(bodyOf<UserBody>(current).user).toMatchObject({ bio: 'I write tests', image });
  });

  test('a new password replaces the old one', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    const changed = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { password: 'a-new-password-1' } },
    });
    expect(changed.status).toBe(200);

    const withOld = await apiClient.send('POST', 'users/login', {
      data: { user: { email: user.email, password: user.password } },
    });
    const withNew = await apiClient.send('POST', 'users/login', {
      data: { user: { email: user.email, password: 'a-new-password-1' } },
    });

    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(200);
  });

  test('a username someone else has is refused with 409', async ({ apiClient, userFactory }) => {
    const [me, other] = [await userFactory(), await userFactory()];

    const res = await apiClient.send('PUT', 'user', {
      token: me.token,
      data: { user: { username: other.username } },
    });

    expect(res.status).toBe(409);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ username: ['has already been taken'] });
  });

  test('an email someone else has is refused with 409', async ({ apiClient, userFactory }) => {
    const [me, other] = [await userFactory(), await userFactory()];

    const res = await apiClient.send('PUT', 'user', {
      token: me.token,
      data: { user: { email: other.email } },
    });

    expect(res.status).toBe(409);
    expect(bodyOf<ErrorBody>(res).errors).toEqual({ email: ['has already been taken'] });
  });

  test('an empty username and a short password are refused with 422', async ({
    apiClient,
    userFactory,
  }) => {
    const user = await userFactory();

    const emptyUsername = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { username: '' } },
    });
    const shortPassword = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { password: 'short' } },
    });

    expect(emptyUsername.status).toBe(422);
    expect(bodyOf<ErrorBody>(emptyUsername).errors).toEqual({ username: ["can't be blank"] });
    expect(shortPassword.status).toBe(422);
    expect(bodyOf<ErrorBody>(shortPassword).errors).toEqual({
      password: ['is too short (minimum is 8 characters)'],
    });
  });

  test('needs a token', async ({ apiClient }) => {
    const res = await apiClient.send('PUT', 'user', { data: { user: { bio: 'x' } } });

    expect(res.status).toBe(401);
    expectContract('PUT /api/user', res);
  });

  test('changing the username returns a token that works', async ({ apiClient, userFactory }) => {
    const user = await userFactory();
    const username = buildUser().username;

    const res = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { username } },
    });

    expect(res.status).toBe(200);
    const fresh = bodyOf<UserBody>(res).user.token;
    const current = await apiClient.send('GET', 'user', { token: fresh });
    expect(bodyOf<UserBody>(current).user.username).toBe(username);
  });
});

// The tests below pin backend defects as observed on 2026-09-25 (docs/findings.md). Each asserts
// what the backend does today and fails, on purpose, when it is fixed.
test.describe('known backend defects: accounts', () => {
  test('a malformed email address is accepted at registration', async ({ apiClient }) => {
    knownIssue('Registration does not validate the email address.');

    // Unique like everything else: a fixed bad address would collide with itself on the next run.
    const email = `no-at-sign-${buildUser().username}`;

    const res = await apiClient.send('POST', 'users', { data: { user: buildUser({ email }) } });

    expect(res.status).toBe(201);
    expect(bodyOf<UserBody>(res).user.email).toBe(email);
  });

  test('a malformed email address is accepted on update', async ({ apiClient, userFactory }) => {
    knownIssue('Updating the account does not validate the email address.');
    const user = await userFactory();
    const email = `no-at-sign-${buildUser().username}`;

    const res = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { email } },
    });

    expect(res.status).toBe(200);
    expect(bodyOf<UserBody>(res).user.email).toBe(email);
  });

  test('emails that differ only in case are treated as different accounts', async ({
    apiClient,
    userFactory,
  }) => {
    knownIssue('Email uniqueness is case-sensitive, so one address can register twice.');
    const first = await userFactory();

    const res = await apiClient.send('POST', 'users', {
      data: { user: buildUser({ email: first.email.toUpperCase() }) },
    });

    expect(res.status).toBe(201);
  });

  test('an invalid token is reported as a missing one', async ({ apiClient }) => {
    knownIssue('A token that is present but invalid gets the message "is missing".');

    const res = await apiClient.send('GET', 'user', { token: 'not-a-token' });

    expect(res.body).toEqual({ errors: { token: ['is missing'] } });
  });

  test('a token from before a username change stops working, and creating an article with it is a 500', async ({
    apiClient,
    userFactory,
  }) => {
    knownIssue('Tokens name the user, so renaming orphans them: 404 on /user and 500 on writes.');
    const user = await userFactory();
    const renamed = await apiClient.send('PUT', 'user', {
      token: user.token,
      data: { user: { username: buildUser().username } },
    });
    expect(renamed.status).toBe(200);

    const read = await apiClient.send('GET', 'user', { token: user.token });
    const write = await apiClient.send('POST', 'articles', {
      token: user.token,
      data: { article: { title: 'stale token', description: 'd', body: 'b' } },
    });

    expect(read.status).toBe(404);
    expect(read.body).toEqual({ errors: { user: ['not found'] } });
    expect(write.status).toBe(500);
    expect(write.body).toEqual({ errors: 'InternalServerError' });
  });
});
