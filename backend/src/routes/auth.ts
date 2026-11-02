
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express'

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import passport from 'passport'
import { createHash, randomBytes } from 'node:crypto'

import User from '../Models/User'

import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/requireAuth'

import {
  isOAuthConfigured,
} from '../config/passport'

import {
  sendPasswordResetEmail,
} from '../services/emailService'

const router = Router()

// --------------------------------------------------
// JWT CONFIGURATION
// --------------------------------------------------

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('JWT_SECRET is not configured.')
  }

  return secret
}

function createToken(userId: string): string {
  return jwt.sign({}, getJwtSecret(), {
    subject: userId,
    expiresIn: '15m',
    issuer: 'intellmeet-api',
    audience: 'intellmeet-web',
  })
}

// --------------------------------------------------
// PUBLIC USER RESPONSE
// --------------------------------------------------

function publicUser(user: {
  _id: unknown
  name: string
  email: string
  role: string
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

// --------------------------------------------------
// CLIENT URL
// --------------------------------------------------

function getClientUrl(): string {
  return (
    process.env.CLIENT_URL || 'http://localhost:5173'
  ).replace(/\/+$/, '')
}

// --------------------------------------------------
// REGISTER
// POST /api/auth/register
// --------------------------------------------------

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body as {
      name?: unknown
      email?: unknown
      password?: unknown
    }

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      res.status(400).json({
        message: 'Please provide your name, email, and password.',
      })
      return
    }

    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({
        message: 'Name must be between 2 and 80 characters.',
      })
      return
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      res.status(400).json({
        message: 'Please provide a valid email address.',
      })
      return
    }

    if (password.length < 8 || password.length > 72) {
      res.status(400).json({
        message: 'Password must be between 8 and 72 characters.',
      })
      return
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    })

    if (existingUser) {
      res.status(409).json({
        message: 'An account with this email already exists.',
      })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
    })

    res.status(201).json({
      message: 'Account created successfully.',
      user: publicUser(user),
      token: createToken(String(user._id)),
    })
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        message: 'An account with this email already exists.',
      })
      return
    }

    console.error('Registration failed:', error)

    res.status(500).json({
      message: 'Could not create your account.',
    })
  }
})

// --------------------------------------------------
// LOGIN
// POST /api/auth/login
// --------------------------------------------------

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email?: unknown
      password?: unknown
    }

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password ||
      password.length > 72
    ) {
      res.status(400).json({
        message: 'Please provide a valid email and password.',
      })
      return
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select('+passwordHash')

    // OAuth-only accounts do not have a password hash.
    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      res.status(401).json({
        message: 'Invalid email or password.',
      })
      return
    }

    res.status(200).json({
      message: 'Login successful.',
      user: publicUser(user),
      token: createToken(String(user._id)),
    })
  } catch (error) {
    console.error('Login failed:', error)

    res.status(500).json({
      message: 'Could not log in. Please try again.',
    })
  }
})

// --------------------------------------------------
// CURRENT USER
// GET /api/auth/me
// --------------------------------------------------

router.get(
  '/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await User.findById(req.userId)

      if (!user) {
        res.status(401).json({
          message: 'User account not found. Please log in again.',
        })
        return
      }

      res.status(200).json({
        user: publicUser(user),
      })
    } catch (error) {
      console.error('Could not load user profile:', error)

      res.status(500).json({
        message: 'Could not load your profile.',
      })
    }
  },
)

// --------------------------------------------------
// GOOGLE OAUTH
// GET /api/auth/google
// --------------------------------------------------

router.get(
  '/google',
  (req: Request, res: Response, next: NextFunction) => {
    if (!isOAuthConfigured('google')) {
      res.status(503).json({
        message: 'Google login is not configured.',
      })
      return
    }

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    })(req, res, next)
  },
)

// GOOGLE CALLBACK
// GET /api/auth/google/callback

function createOAuthCallback(provider: 'google' | 'github') {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    passport.authenticate(
      provider,
      { session: false },
      (
        error: Error | null,
        user: Express.User | false | null,
      ) => {
        if (error || !user) {
          const message =
            error?.message || 'Social login failed. Please try again.'

          res.redirect(
            `${getClientUrl()}/?oauthError=${encodeURIComponent(message)}`,
          )
          return
        }

        const authenticatedUser = user as unknown as {
          _id: unknown
        }

        const token = createToken(
          String(authenticatedUser._id),
        )

        res.redirect(
          `${getClientUrl()}/auth/callback#token=${encodeURIComponent(token)}`,
        )
      },
    )(req, res, next)
  }
}

router.get(
  '/google/callback',
  createOAuthCallback('google'),
)

// --------------------------------------------------
// GITHUB OAUTH
// GET /api/auth/github
// --------------------------------------------------

router.get(
  '/github',
  (req: Request, res: Response, next: NextFunction) => {
    if (!isOAuthConfigured('github')) {
      res.status(503).json({
        message: 'GitHub login is not configured.',
      })
      return
    }

    passport.authenticate('github', {
      scope: ['user:email'],
      session: false,
    })(req, res, next)
  },
)

// GITHUB CALLBACK
// GET /api/auth/github/callback

router.get(
  '/github/callback',
  createOAuthCallback('github'),
)

// --------------------------------------------------
// FORGOT PASSWORD
// POST /api/auth/forgot-password
// --------------------------------------------------

router.post(
  '/forgot-password',
  async (req: Request, res: Response) => {
    const genericMessage =
      'If an eligible account exists, a password-reset email will be sent.'

    try {
      const { email } = req.body as {
        email?: unknown
      }

      if (
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        res.status(400).json({
          message: 'Please provide a valid email address.',
        })
        return
      }

      const cleanEmail = email.trim().toLowerCase()

      const user = await User.findOne({
        email: cleanEmail,
      }).select('+passwordHash')

      // Do not issue password resets for OAuth-only accounts.
      if (!user || !user.passwordHash) {
        res.status(200).json({
          message: genericMessage,
        })
        return
      }

      // Generate a secure random reset token.
      const resetToken = randomBytes(32).toString('hex')

      // Store only the SHA-256 hash in MongoDB.
      const resetTokenHash = createHash('sha256')
        .update(resetToken)
        .digest('hex')

      // Token expires after 15 minutes.
      const expiresAt = new Date(
        Date.now() + 15 * 60 * 1000,
      )

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetTokenHash: resetTokenHash,
            passwordResetExpiresAt: expiresAt,
          },
        },
      )

      const resetUrl = new URL(
        '/reset-password',
        getClientUrl(),
      )

      resetUrl.searchParams.set('token', resetToken)

      try {
        await sendPasswordResetEmail(
          user.email,
          user.name,
          resetUrl.toString(),
        )
      } catch (emailError) {
        // Clear the token if email delivery fails.
        await User.updateOne(
          {
            _id: user._id,
            passwordResetTokenHash: resetTokenHash,
          },
          {
            $unset: {
              passwordResetTokenHash: 1,
              passwordResetExpiresAt: 1,
            },
          },
        )

        console.error(
          'Password reset email failed:',
          emailError,
        )
      }

      res.status(200).json({
        message: genericMessage,
      })
    } catch (error) {
      console.error('Forgot password failed:', error)

      res.status(200).json({
        message: genericMessage,
      })
    }
  },
)

// --------------------------------------------------
// RESET PASSWORD
// POST /api/auth/reset-password
// --------------------------------------------------

router.post(
  '/reset-password',
  async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as {
        token?: unknown
        password?: unknown
      }

      if (
        typeof token !== 'string' ||
        token.length !== 64 ||
        !/^[a-f0-9]+$/i.test(token) ||
        typeof password !== 'string'
      ) {
        res.status(400).json({
          message:
            'A valid reset token and new password are required.',
        })
        return
      }

      if (password.length < 8 || password.length > 72) {
        res.status(400).json({
          message: 'Password must be between 8 and 72 characters.',
        })
        return
      }

      const tokenHash = createHash('sha256')
        .update(token)
        .digest('hex')

      const passwordHash = await bcrypt.hash(password, 12)

      // Atomic update prevents the token being used twice.
      const user = await User.findOneAndUpdate(
        {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: {
            $gt: new Date(),
          },
        },
        {
          $set: {
            passwordHash,
          },
          $unset: {
            passwordResetTokenHash: 1,
            passwordResetExpiresAt: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )

      if (!user) {
        res.status(400).json({
          message:
            'This password-reset link is invalid or has expired.',
        })
        return
      }

      res.status(200).json({
        message: 'Password has been reset successfully.',
        user: publicUser(user),
        token: createToken(String(user._id)),
      })
    } catch (error) {
      console.error('Password reset failed:', error)

      res.status(500).json({
        message: 'Could not reset your password. Please try again.',
      })
    }
  },
)

export default router
