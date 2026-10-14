
import type { Request, Response, NextFunction } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'

export interface AuthenticatedRequest extends Request {
  userId?: string
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({
      message: 'Authentication required. Please log in.',
    })
    return
  }

  const token = authorization.slice('Bearer '.length).trim()
  const secret = process.env.JWT_SECRET

  if (!secret) {
    res.status(500).json({
      message: 'Authentication is not configured.',
    })
    return
  }

  try {
   const decoded = jwt.verify(token, secret, {
  issuer: 'intellmeet-api',
  audience: 'intellmeet-web',
})

    if (
      typeof decoded === 'string' ||
      !('sub' in decoded) ||
      typeof (decoded as JwtPayload).sub !== 'string'
    ) {
      res.status(401).json({
        message: 'Invalid authentication token.',
      })
      return
    }

    req.userId = (decoded as JwtPayload).sub
    next()
  } catch {
    res.status(401).json({
      message: 'Your session is invalid or expired. Please log in again.',
    })
  }
}
