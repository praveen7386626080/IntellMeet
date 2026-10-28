import { Schema, model, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    phoneNumber: { type: String, trim: true, maxlength: 25, default: '' },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    designation: { type: String, trim: true, maxlength: 100, default: '' },
    profilePhoto: { type: String, trim: true, maxlength: 2048, default: '' },
    profilePhotoPublicId: { type: String, select: false, default: '' },
    deletionConfirmationHash: { type: String, select: false, default: '' },
    deletionConfirmationExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true },
)

export type UserDocument = InferSchemaType<typeof userSchema>
const User = model('User', userSchema)
export default User
