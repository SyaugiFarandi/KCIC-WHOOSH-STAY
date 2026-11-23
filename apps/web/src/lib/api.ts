export const SESSION_EXPIRED_EVENT = 'whoosh:session-expired';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown[],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FailureBody {
  success?: false;
  error?: { code?: string; message?: string; details?: unknown[] };
  meta?: { requestId?: string };
}

async function parseResponse<T>(response: Response, path?: string): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const failure = body as FailureBody | null;
    if (
      response.status === 401 &&
      failure?.error?.code === 'AUTH_REQUIRED' &&
      path &&
      !path.startsWith('/api/v1/auth/') &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      failure?.error?.code ?? 'INTERNAL_ERROR',
      failure?.error?.message ?? 'Terjadi kesalahan pada server',
      failure?.error?.details,
      failure?.meta?.requestId,
    );
  }

  if (body && typeof body === 'object' && 'success' in body) {
    const envelope = body as { success: boolean; data?: T };
    if (!envelope.success) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Respons server tidak valid');
    }
    return envelope.data as T;
  }

  return body as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server');
  }

  return parseResponse<T>(response, path);
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server');
  }
  if (!response.ok) {
    await parseResponse(response, path);
    throw new ApiError(response.status, 'INTERNAL_ERROR', 'Unduhan gagal');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = match?.[1] ?? fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak dapat terhubung ke server');
  }

  return parseResponse<T>(response, path);
}

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}
