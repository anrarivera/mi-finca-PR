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
    console.log('=== AUTH CHECK ===')
    console.log('Auth header present:', !!authHeader)
    console.log('JWT_ACCESS_SECRET set:', !!process.env.JWT_ACCESS_SECRET)
    console.log('=================')

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