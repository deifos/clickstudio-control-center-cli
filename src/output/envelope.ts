export interface Breadcrumb {
  action: string;
  cmd: string;
  description?: string;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
  summary?: string;
  notice?: string;
  breadcrumbs?: Breadcrumb[];
}

export interface ErrorResponse {
  ok: false;
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
