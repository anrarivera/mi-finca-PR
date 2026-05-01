export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  unauthorized: () =>
    new AppError(401, 'UNAUTHORIZED', 'Authentication required'),
  forbidden: () =>
    new AppError(403, 'FORBIDDEN', 'Insufficient permissions'),
  notFound: (resource = 'Resource') =>
    new AppError(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (message: string) =>
    new AppError(409, 'CONFLICT', message),
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  internal: () =>
    new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred'),
}