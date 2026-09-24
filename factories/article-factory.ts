import { faker } from '@faker-js/faker';
import type { ApiClient, Article, ArticleInput } from '../api-client/client';

export type NewArticleOverrides = Partial<ArticleInput>;

/**
 * A tag no other test uses. Filtering the feed by it (`/tag/<tag>`) gives a test a
 * deterministic article list even though every parallel worker shares one database.
 */
export function buildTag(): string {
  return `tag-${faker.string.alphanumeric({ length: 8, casing: 'lower' })}`;
}

/**
 * Builds article content with a unique title (and therefore a unique slug) without
 * touching the network — for tests that publish through the UI.
 */
export function buildArticle(overrides: NewArticleOverrides = {}): ArticleInput {
  const unique = faker.string.alphanumeric({ length: 8, casing: 'lower' });

  return {
    title: overrides.title ?? `${faker.lorem.words(3)} ${unique}`,
    description: overrides.description ?? faker.lorem.sentence(),
    body: overrides.body ?? faker.lorem.paragraph(),
    tagList: overrides.tagList ?? [],
  };
}

export async function createArticle(
  apiClient: ApiClient,
  token: string,
  overrides: NewArticleOverrides = {},
): Promise<Article> {
  return apiClient.createArticle(token, buildArticle(overrides));
}
