import { Schema, model, type InferSchemaType } from 'mongoose'

const workspaceMessageSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkspaceTeam',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true },
)

export type WorkspaceMessageDocument = InferSchemaType<
  typeof workspaceMessageSchema
>

export default model('WorkspaceMessage', workspaceMessageSchema)
