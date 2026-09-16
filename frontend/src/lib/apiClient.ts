/**
 * Typed client for the backend's response envelope (backend/src/utils/responseEnvelope.ts).
 * Every list/detail/mutation call in the app goes through this — no feature module should
 * call `fetch` directly (TASK-005 Scope).
 */

export interface FieldError {
  field?: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string | null;
  meta: Record<string, unknown>;
}

interface ErrorEnvelope {
  success: false;
  data: null;
  message: string;
  errors: FieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/** FR-004: a 401 from anywhere triggers one centralized redirect, never a per-page handler. */
let unauthorizedHandler = () => {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

/** Overridable so tests (and eventually TASK-006's auth module) can swap the redirect strategy. */
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

type QueryParamValue = string | number | boolean | undefined | null;

function buildUrl(path: string, params?: Record<string, QueryParamValue>): string {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  params?: Record<string, QueryParamValue>;
  body?: unknown;
  signal?: AbortSignal;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

/** FR-003: retries once on a network failure (fetch throwing), never on a parsed 4xx/5xx business error. */
async function requestEnvelope<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<Envelope<T>> {
  const { method = 'GET', params, body, signal } = options;
  const url = buildUrl(path, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    if (!isRetry) return requestEnvelope<T>(path, options, true);
    throw new ApiError('Network error — check your connection and try again.', 0);
  }

  let envelope: SuccessEnvelope<T> | ErrorEnvelope;
  try {
    envelope = await response.json();
  } catch {
    throw new ApiError('The server returned an invalid response.', response.status);
  }

  if (!envelope.success) {
    if (response.status === 401) unauthorizedHandler();
    throw new ApiError(envelope.message, response.status, envelope.errors);
  }

  return { data: envelope.data, meta: envelope.meta };
}

async function requestData<T>(path: string, options?: RequestOptions): Promise<T> {
  const { data } = await requestEnvelope<T>(path, options);
  return data;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

async function requestPaginated<T>(path: string, options?: RequestOptions): Promise<PaginatedResponse<T>> {
  const { data, meta } = await requestEnvelope<T[]>(path, options);
  return { items: data, meta: meta as unknown as PaginationMeta };
}

export interface FileDownloadResult {
  mode: 'file';
  blob: Blob;
  filename: string;
}

export interface AsyncJobResult {
  mode: 'async';
  jobId: string;
}

function filenameFromContentDisposition(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? 'export';
}

/**
 * TASK-029: POST /api/exports returns either a raw file stream (200, sync path) or a JSON
 * envelope with a job id (202, async path) — neither fits `requestData`'s always-JSON
 * assumption, so this bypasses `requestEnvelope` entirely for the 200 case.
 */
async function postForFileOrJob(
  path: string,
  body: unknown,
): Promise<FileDownloadResult | AsyncJobResult> {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.status === 202) {
    const envelope = (await response.json()) as SuccessEnvelope<{ jobId: string }>;
    return { mode: 'async', jobId: envelope.data.jobId };
  }

  if (!response.ok) {
    const envelope = (await response.json()) as ErrorEnvelope;
    if (response.status === 401) unauthorizedHandler();
    throw new ApiError(envelope.message, response.status, envelope.errors);
  }

  const blob = await response.blob();
  const filename = filenameFromContentDisposition(response.headers.get('Content-Disposition'));
  return { mode: 'file', blob, filename };
}

export const apiClient = {
  get<T>(path: string, params?: Record<string, QueryParamValue>, signal?: AbortSignal) {
    return requestData<T>(path, { method: 'GET', params, signal });
  },
  getPaginated<T>(path: string, params?: Record<string, QueryParamValue>, signal?: AbortSignal) {
    return requestPaginated<T>(path, { method: 'GET', params, signal });
  },
  post<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return requestData<T>(path, { method: 'POST', body, signal });
  },
  patch<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return requestData<T>(path, { method: 'PATCH', body, signal });
  },
  put<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return requestData<T>(path, { method: 'PUT', body, signal });
  },
  delete<T>(path: string, signal?: AbortSignal) {
    return requestData<T>(path, { method: 'DELETE', signal });
  },
  postForFileOrJob(path: string, body: unknown) {
    return postForFileOrJob(path, body);
  },
  async downloadFile(path: string): Promise<FileDownloadResult> {
    const response = await fetch(buildUrl(path), { credentials: 'include' });
    if (!response.ok) {
      const envelope = (await response.json()) as ErrorEnvelope;
      throw new ApiError(envelope.message, response.status, envelope.errors);
    }
    const blob = await response.blob();
    const filename = filenameFromContentDisposition(response.headers.get('Content-Disposition'));
    return { mode: 'file', blob, filename };
  },
};
