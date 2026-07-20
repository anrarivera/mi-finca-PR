import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, JwtPayload } from '../lib/jwt'
import { Errors } from '../lib/errors'

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
  } catch (err) {
    console.error('Auth error:', err)
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    })
  }
}

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()
  
  try {
    const token = header.split(' ')[1]
    req.user = verifyAccessToken(token)
  } catch {
    // Invalid token treated as anonymous — don't block the request
  }
  next()
}