
import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../Models/User'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth'

const router = Router()

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

// POST /api/auth/register
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

    const existingUser = await User.findOne({ email: cleanEmail })

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
    // A unique MongoDB index also protects against simultaneous registrations.
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

// POST /api/auth/login
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

    // Use the same response for unknown emails and incorrect passwords.
    if (
      !user ||
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

// GET /api/auth/me — return the currently authenticated user
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

export default router
