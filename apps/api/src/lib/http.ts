import type { Response } from 'express';
import type { PaginationMeta } from '@whoosh/shared';
import { getRequestContext } from './context.js';

export function requestId(): string {
  return getRequestContext()?.requestId ?? 'unknown';
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; pagination?: PaginationMeta } = {},
): void {
  const status = options.status ?? 200;
  res.status(status).json({
    success: true,
    data,
    meta: {
      requestId: requestId(),
      ...(options.pagination ? { pagination: options.pagination } : {}),
    },
  });
}

export function paginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
