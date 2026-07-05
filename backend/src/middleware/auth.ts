import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, JwtPayload } from '../lib/jwt'
import { Errors } from '../lib/errors'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw Errors.unauthorized()
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyAccessToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    })
  }
}

// Sets req.user when a valid bearer token is present, but never rejects —
// for routes that serve public data enriched with the caller's own records
// (e.g. GET /crops returns built-ins plus the user's custom crops).
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(authHeader.split(' ')[1])
    } catch {
      // invalid/expired token → treat as anonymous
    }
  }
  next()
}