import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { env } from './env'

export type JwtPayload = {
  userId: string
  email: string
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
}

export function signRefreshToken(payload: JwtPayload): string {
  // jwtid makes every refresh token unique even when two are signed for the
  // same user within the same second (jwt iat has 1s resolution) — the
  // RefreshToken.token column is UNIQUE and a collision would 500.
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: '30d',
    jwtid: randomUUID(),
  })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload
}
