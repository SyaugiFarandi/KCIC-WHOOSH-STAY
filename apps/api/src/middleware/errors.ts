import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, type ErrorCode } from '@whoosh/shared';
import { getRequestContext } from '../lib/context.js';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown[]) {
    super(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, ERROR_CODES.AUTH_REQUIRED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, ERROR_CODES.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, ERROR_CODES.NOT_FOUND, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(409, code, message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, ERROR_CODES.INTEGRATION_UNAVAILABLE, message);
  }
}

export class StorageUnavailableError extends AppError {
  constructor(message = 'File storage is temporarily unavailable') {
    super(503, ERROR_CODES.STORAGE_UNAVAILABLE, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super(413, ERROR_CODES.ATTACHMENT_TOO_LARGE, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string) {
    super(415, ERROR_CODES.ATTACHMENT_TYPE_NOT_ALLOWED, message);
  }
}

export class AttachmentMissingError extends AppError {
  constructor(message = 'The stored file is no longer available') {
    super(404, ERROR_CODES.ATTACHMENT_OBJECT_MISSING, message);
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  const context = getRequestContext();
  res.status(404).json({
    success: false,
    error: { code: ERROR_CODES.NOT_FOUND, message: 'Endpoint not found' },
    meta: { requestId: context?.requestId ?? 'unknown' },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const context = getRequestContext();
  const requestId = context?.requestId ?? 'unknown';

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId }, 'request failed');
    }
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      meta: { requestId },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: error.issues,
      },
      meta: { requestId },
    });
    return;
  }

  const bodyParserType = (error as { type?: string } | null)?.type;
  if (bodyParserType === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Body JSON tidak valid' },
      meta: { requestId },
    });
    return;
  }
  if (bodyParserType === 'entity.too.large' || (error as { status?: number } | null)?.status === 413) {
    res.status(413).json({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Payload melebihi batas ukuran' },
      meta: { requestId },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: ERROR_CODES.CONFLICT,
          message: 'A record with the same unique values already exists',
        },
        meta: { requestId },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Resource not found' },
        meta: { requestId },
      });
      return;
    }
  }

  const databaseCode = (error as { code?: string } | null)?.code;
  if (databaseCode === '23P01') {
    res.status(409).json({
      success: false,
      error: {
        code: ERROR_CODES.BED_ALLOCATION_CONFLICT,
        message: 'The selected bed is already allocated for the requested dates',
      },
      meta: { requestId },
    });
    return;
  }

  logger.error({ err: error, requestId }, 'unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
    meta: { requestId },
  });
};
