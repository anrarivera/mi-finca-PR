import { Request, Response, NextFunction } from 'express'
import { AppError } from '../lib/errors'

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log EVERYTHING so we can see what's going wrong
  console.error('=== ERROR CAUGHT ===')
  console.error('Path:', req.method, req.path)
  console.error('Error name:', err.name)
  console.error('Error message:', err.message)
  console.error('===================')

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      }
    })
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    }
  })
}