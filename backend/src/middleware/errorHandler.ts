import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {

  if (err instanceof AppError) {
    // Expected rejections (validation, auth, not-found) — logged lean at
    // warn so spikes are visible without stack noise.
    logger.warn({
      code: err.code,
      status: err.statusCode,
      msg: err.message,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.userId ?? null,
    }, 'request rejected')
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      }
    })
  }

  // body-parser rejections (not AppErrors) — keep their real status instead
  // of collapsing them into a 500, so the client can tell "too big" apart
  // from "server broke".
  if ((err as { type?: string }).type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The data being saved is too large for the server to accept',
      }
    })
  }

  // Unexpected — the bug class. Full stack + request context so a Railway
  // log search for "unhandled error" reconstructs what happened.
  logger.error({
    err,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.userId ?? null,
  }, 'unhandled error')

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  })
}