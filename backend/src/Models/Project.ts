import { Schema, model, type InferSchemaType } from 'mongoose'

const projectSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    status: {
      type: String,
      enum: ['planning', 'active', 'completed'],
      default: 'active',
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
)

export type ProjectDocument = InferSchemaType<typeof projectSchema>

export default model('Project', projectSchema)
