import type { ApiResult } from '@api-client/client';
import { test } from '@playwright/test';

// Narrow shapes for reading responses in the API tests. They are safe to cast to because every
// test checks the response against the contract first (expectContract), which is what
// guarantees these keys exist and have these types. The generated types mark everything optional
// and nullable, which is true of the spec and not of the responses.

export type Person = {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
};
export type UserBody = {
  user: {
    username: string;
    email: string;
    bio: string | null;
    image: string | null;
    token: string;
  };
};
export type ArticleShape = {
  slug: string;
  title: string;
  description: string;
  /** Absent from list items. */
  body?: string;
  author: Person;
  comments: unknown[];
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  tagList: string[];
};
export type ArticleBody = { article: ArticleShape };
export type ArticlesBody = { articles: ArticleShape[]; articlesCount: number };
export type CommentShape = {
  id: number;
  body: string;
  author: Person;
  createdAt: string;
  updatedAt: string;
};
export type CommentBody = { comment: CommentShape };
export type CommentsBody = { comments: CommentShape[] };
export type ProfileBody = { profile: Person };
export type TagsBody = { tags: string[] };
export type ErrorBody = { errors: Record<string, string[]> };

export const bodyOf = <Body>(result: ApiResult): Body => result.body as Body;

/** The slug the backend derives from a title. */
export const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Labels the running test as pinning a backend defect, asserted as observed. When the backend
 * is fixed the test fails on purpose; rewrite it to assert the fixed behaviour. The defects are
 * collected in docs/findings.md.
 */
export const knownIssue = (description: string): void => {
  test.info().annotations.push({ type: 'known-issue', description });
};
