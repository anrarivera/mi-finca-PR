import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

export type JwtPayload = {
  userId: string
  email: string
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) throw new Error('JWT_ACCESS_SECRET not set')
  return secret
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET not set')
  return secret
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' })
}

export function signRefreshToken(payload: JwtPayload): string {
  // jti makes every refresh token unique — without it, two logins in the
  // same second sign byte-identical JWTs (same payload + same iat second)
  // and the second INSERT violates refresh_tokens.token's UNIQUE constraint.
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: '30d', jwtid: randomUUID() })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getAccessSecret()) as JwtPayload
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, getRefreshSecret()) as JwtPayload
}