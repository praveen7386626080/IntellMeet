
import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'node:crypto'
import multer from 'multer'
import mongoose from 'mongoose'

import User from '../Models/User'
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/requireAuth'

const router = Router()
const PROFILE_PHOTO_BUCKET = 'profilePhotos'

// --------------------------------------------------
// MULTER CONFIGURATION
// --------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    if (!allowed.includes(file.mimetype)) {
      callback(
        new Error(
          'Only JPEG, PNG, and WebP images are supported.',
        ),
      )
      return
    }

    callback(null, true)
  },
})

// --------------------------------------------------
// PUBLIC PROFILE
// --------------------------------------------------

function publicProfile(user: {
  _id: unknown
  name: string
  email: string
  role: string
  phoneNumber?: string
  bio?: string
  designation?: string
  profilePhoto?: string
  createdAt?: Date
  updatedAt?: Date
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    phoneNumber: user.phoneNumber ?? '',
    bio: user.bio ?? '',
    designation: user.designation ?? '',
    profilePhoto: user.profilePhoto ?? '',
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  }
}

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function sha256(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
}

function getProfilePhotoBucket() {
  const database = mongoose.connection.db

  if (!database) {
    throw new Error('MongoDB connection is not ready.')
  }

  return new mongoose.mongo.GridFSBucket(database, {
    bucketName: PROFILE_PHOTO_BUCKET,
  })
}

function uploadProfilePhoto(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const bucket = getProfilePhotoBucket()

  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, {
      metadata: { contentType },
    })

    stream.once('error', reject)
    stream.once('finish', () => {
      if (!stream.id) {
        reject(new Error('Profile photo upload returned no file ID.'))
        return
      }

      resolve(stream.id.toString())
    })
    stream.end(buffer)
  })
}

async function deleteProfilePhotoFile(fileId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error('Stored profile photo file ID is invalid.')
  }

  await getProfilePhotoBucket().delete(
    new mongoose.Types.ObjectId(fileId),
  )
}

// Profile photos are public assets, so browsers can display them without an Authorization header.
router.get(
  '/photo/:fileId',
  async (req, res) => {
    const { fileId } = req.params

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      res.status(404).end()
      return
    }

    try {
      const currentPhoto = await User.findOne({
        profilePhotoFileId: fileId,
      }).select('_id')

      if (!currentPhoto) {
        res.status(404).end()
        return
      }

      const bucket = getProfilePhotoBucket()
      const objectId = new mongoose.Types.ObjectId(fileId)
      const [file] = await bucket
        .find({ _id: objectId })
        .limit(1)
        .toArray()

      if (!file) {
        res.status(404).end()
        return
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ]
      const storedType = file.metadata?.contentType
      const contentType =
        typeof storedType === 'string' &&
        allowedTypes.includes(storedType)
          ? storedType
          : 'application/octet-stream'

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      })

      const stream = bucket.openDownloadStream(objectId)
      stream.once('error', (error) => {
        console.error('Could not stream profile photo:', error)
        if (res.headersSent) {
          res.destroy()
        } else {
          res.status(500).end()
        }
      })
      stream.pipe(res)
    } catch (error) {
      console.error('Could not retrieve profile photo:', error)
      res.status(500).end()
    }
  },
)

// All profile routes require authentication.
router.use(requireAuth)

// --------------------------------------------------
// GET PROFILE
// GET /api/profile/me
// --------------------------------------------------

router.get(
  '/me',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await User.findById(req.userId)

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      res.json({
        success: true,
        user: publicProfile(user),
      })
    } catch (error) {
      console.error('Could not fetch profile:', error)

      res.status(500).json({
        message: 'Could not fetch your profile.',
      })
    }
  },
)

// --------------------------------------------------
// UPDATE PROFILE
// PATCH /api/profile/me
// --------------------------------------------------

router.patch(
  '/me',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isObject(req.body)) {
        res.status(400).json({
          message: 'A JSON object is required.',
        })
        return
      }

      const allowed = [
        'name',
        'email',
        'phoneNumber',
        'bio',
        'designation',
      ]

      const keys = Object.keys(req.body)

      if (
        !keys.length ||
        keys.some((key) => !allowed.includes(key))
      ) {
        res.status(400).json({
          message: 'Provide supported profile fields only.',
        })
        return
      }

      const updates: Record<string, string> = {}

      for (const key of keys) {
        const value = req.body[key]

        if (typeof value !== 'string') {
          res.status(400).json({
            message: `${key} must be a string.`,
          })
          return
        }

        const clean = value.trim()

        const limits: Record<string, number> = {
          name: 80,
          email: 254,
          phoneNumber: 25,
          bio: 500,
          designation: 100,
        }

        if (
          clean.length > limits[key] ||
          (key === 'name' && clean.length < 2)
        ) {
          res.status(400).json({
            message: `Invalid ${key} length.`,
          })
          return
        }

        if (key === 'email') {
          const email = clean.toLowerCase()

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({
              message: 'Please provide a valid email address.',
            })
            return
          }

          updates.email = email
        } else if (key === 'phoneNumber') {
          if (
            clean &&
            !/^\+?[0-9 ()-]{7,25}$/.test(clean)
          ) {
            res.status(400).json({
              message: 'Please provide a valid phone number.',
            })
            return
          }

          updates[key] = clean
        } else {
          updates[key] = clean
        }
      }

      if (updates.email) {
        const duplicate = await User.findOne({
          email: updates.email,
          _id: { $ne: req.userId },
        }).select('_id')

        if (duplicate) {
          res.status(409).json({
            message: 'An account with this email already exists.',
          })
          return
        }
      }

      const user = await User.findByIdAndUpdate(
        req.userId,
        { $set: updates },
        {
          new: true,
          runValidators: true,
        },
      )

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      res.json({
        success: true,
        message: 'Profile updated successfully.',
        user: publicProfile(user),
      })
    } catch (error: unknown) {
      if (isObject(error) && error.code === 11000) {
        res.status(409).json({
          message: 'An account with this email already exists.',
        })
        return
      }

      console.error('Could not update profile:', error)

      res.status(500).json({
        message: 'Could not update your profile.',
      })
    }
  },
)

// --------------------------------------------------
// UPLOAD PROFILE PHOTO
// POST /api/profile/me/photo
// Multipart field: photo
// --------------------------------------------------

router.post(
  '/me/photo',
  (req, res, next) => {
    upload.single('photo')(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        res.status(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        ).json({
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'Photo must be 5 MB or smaller.'
              : 'Invalid photo upload.',
        })
        return
      }

      if (error) {
        res.status(415).json({
          message:
            error instanceof Error
              ? error.message
              : 'Unsupported photo format.',
        })
        return
      }

      next()
    })
  },
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          message:
            'Choose a photo to upload using the "photo" field.',
        })
        return
      }

      const user = await User.findById(req.userId)
        .select('+profilePhotoFileId')

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      const oldFileId = user.profilePhotoFileId
      const fileId = await uploadProfilePhoto(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      )

      user.profilePhoto = `/api/profile/photo/${fileId}`
      user.profilePhotoFileId = fileId

      try {
        await user.save()
      } catch (error) {
        try {
          await deleteProfilePhotoFile(fileId)
        } catch (cleanupError) {
          console.error(
            'Could not remove an unreferenced profile photo:',
            cleanupError,
          )
        }

        throw error
      }

      if (oldFileId && oldFileId !== fileId) {
        try {
          await deleteProfilePhotoFile(oldFileId)
        } catch (error) {
          console.error(
            'Could not remove previous profile photo:',
            error,
          )
        }
      }

      res.json({
        success: true,
        message: 'Profile photo updated.',
        user: publicProfile(user),
      })
    } catch (error) {
      console.error('Could not upload profile photo:', error)

      res.status(500).json({
        message: 'Could not upload profile photo. Please try again.',
      })
    }
  },
)

// --------------------------------------------------
// DELETE PROFILE PHOTO
// DELETE /api/profile/me/photo
// --------------------------------------------------

router.delete(
  '/me/photo',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await User.findById(req.userId)
        .select('+profilePhotoFileId')

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      const fileId = user.profilePhotoFileId

      user.profilePhoto = ''
      user.profilePhotoFileId = ''

      await user.save()

      if (fileId) {
        try {
          await deleteProfilePhotoFile(fileId)
        } catch (error) {
          console.error(
            'Could not remove profile photo file:',
            error,
          )
        }
      }

      res.json({
        success: true,
        message: 'Profile photo removed.',
        user: publicProfile(user),
      })
    } catch (error) {
      console.error('Could not remove profile photo:', error)

      res.status(500).json({
        message: 'Could not remove profile photo.',
      })
    }
  },
)

// --------------------------------------------------
// CHANGE PASSWORD
// PATCH /api/profile/me/password
// --------------------------------------------------

router.patch(
  '/me/password',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        currentPassword,
        newPassword,
        confirmNewPassword,
      } = req.body ?? {}

      if (
        typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmNewPassword !== 'string'
      ) {
        res.status(400).json({
          message:
            'Current password, new password, and confirmation are required.',
        })
        return
      }

      if (
        newPassword.length < 8 ||
        newPassword.length > 72
      ) {
        res.status(400).json({
          message:
            'New password must be between 8 and 72 characters.',
        })
        return
      }

      if (newPassword !== confirmNewPassword) {
        res.status(400).json({
          message:
            'New password and confirmation do not match.',
        })
        return
      }

      if (currentPassword === newPassword) {
        res.status(400).json({
          message:
            'New password must be different from current password.',
        })
        return
      }

      const user = await User.findById(req.userId)
        .select('+passwordHash')

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      // OAuth-only accounts do not have a local password.
      const storedPasswordHash = user.passwordHash

      if (!storedPasswordHash) {
        res.status(400).json({
          message:
            'This account does not have a password. Please use your social login provider.',
        })
        return
      }

      if (
        !(await bcrypt.compare(
          currentPassword,
          storedPasswordHash,
        ))
      ) {
        res.status(401).json({
          message: 'Current password is incorrect.',
        })
        return
      }

      user.passwordHash = await bcrypt.hash(
        newPassword,
        12,
      )

      await user.save()

      res.json({
        success: true,
        message:
          'Password changed successfully. Please log in again.',
      })
    } catch (error) {
      console.error('Could not change password:', error)

      res.status(500).json({
        message: 'Could not change your password.',
      })
    }
  },
)

// --------------------------------------------------
// REQUEST ACCOUNT DELETION
// POST /api/profile/me/delete/request
// --------------------------------------------------

router.post(
  '/me/delete/request',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { currentPassword } = req.body ?? {}

      if (
        typeof currentPassword !== 'string' ||
        !currentPassword
      ) {
        res.status(400).json({
          message: 'Current password is required.',
        })
        return
      }

      const user = await User.findById(req.userId)
        .select('+passwordHash')

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      // OAuth-only accounts cannot use password confirmation.
      const storedPasswordHash = user.passwordHash

      if (!storedPasswordHash) {
        res.status(400).json({
          message:
            'This account does not have a local password. Account deletion through social-account reauthentication is not currently supported.',
        })
        return
      }

      if (
        !(await bcrypt.compare(
          currentPassword,
          storedPasswordHash,
        ))
      ) {
        res.status(401).json({
          message: 'Current password is incorrect.',
        })
        return
      }

      const confirmationToken = randomBytes(32).toString(
        'hex',
      )

      user.set(
        'deletionConfirmationHash',
        sha256(confirmationToken),
      )

      user.set(
        'deletionConfirmationExpiresAt',
        new Date(Date.now() + 5 * 60 * 1000),
      )

      await user.save()

      res.json({
        success: true,
        confirmationRequired: true,
        confirmationToken,
        expiresInSeconds: 300,
        confirmationText: 'DELETE MY ACCOUNT',
        message:
          'Confirm account deletion within five minutes.',
      })
    } catch (error) {
      console.error(
        'Could not initiate account deletion:',
        error,
      )

      res.status(500).json({
        message: 'Could not initiate account deletion.',
      })
    }
  },
)

// --------------------------------------------------
// CONFIRM ACCOUNT DELETION
// POST /api/profile/me/delete/confirm
// --------------------------------------------------

router.post(
  '/me/delete/confirm',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        confirmationToken,
        confirmationText,
      } = req.body ?? {}

      if (
        typeof confirmationToken !== 'string' ||
        typeof confirmationText !== 'string'
      ) {
        res.status(400).json({
          message:
            'Confirmation token and confirmation text are required.',
        })
        return
      }

      if (confirmationText !== 'DELETE MY ACCOUNT') {
        res.status(400).json({
          message:
            'Type DELETE MY ACCOUNT exactly to confirm.',
        })
        return
      }

      const user = await User.findById(req.userId)
        .select(
          '+deletionConfirmationHash ' +
          '+deletionConfirmationExpiresAt ' +
          '+profilePhotoFileId',
        )

      if (!user) {
        res.status(404).json({
          message: 'User account not found.',
        })
        return
      }

      const storedHash = user.get(
        'deletionConfirmationHash',
      ) as string | undefined

      const expiresAt = user.get(
        'deletionConfirmationExpiresAt',
      ) as Date | null | undefined

      if (
        !storedHash ||
        storedHash !== sha256(confirmationToken) ||
        !expiresAt ||
        expiresAt.getTime() < Date.now()
      ) {
        user.set('deletionConfirmationHash', '')
        user.set('deletionConfirmationExpiresAt', null)

        await user.save()

        res.status(400).json({
          message:
            'Confirmation token is invalid or expired. Start the deletion process again.',
        })
        return
      }

      const fileId = user.profilePhotoFileId

      await User.deleteOne({
        _id: user._id,
      })

      if (fileId) {
        try {
          await deleteProfilePhotoFile(fileId)
        } catch (error) {
          console.error(
            'Could not remove deleted user profile photo file:',
            error,
          )
        }
      }

      // Related records are intentionally not deleted here.
      // Add an explicit retention/cascade policy before production.

      res.json({
        success: true,
        message: 'Account deleted successfully.',
      })
    } catch (error) {
      console.error(
        'Could not confirm account deletion:',
        error,
      )

      res.status(500).json({
        message: 'Could not delete account.',
      })
    }
  },
)

export default router
