// Bumped on breaking changes to the envelope shape (e.g. renaming a field,
// changing the type of `data`, dropping a required key). Adding new optional
// fields is non-breaking and does NOT bump this. Agents can branch on this
// to stay forward-compatible.
export const SCHEMA_VERSION = '1';

export interface Breadcrumb {
  action: string;
  cmd: string;
  description?: string;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  schemaVersion: typeof SCHEMA_VERSION;
  data: T;
  summary?: string;
  notice?: string;
  breadcrumbs?: Breadcrumb[];
}

export interface ErrorResponse {
  ok: false;
  schemaVersion: typeof SCHEMA_VERSION;
  error: string;
  code: string;
  hint?: string;
}

export type Response<T = unknown> = SuccessResponse<T> | ErrorResponse;

export interface ResponseOptions {
  summary?: string;
  notice?: string;
  breadcrumbs?: Breadcrumb[];
}
