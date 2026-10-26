import { Schema, model, type InferSchemaType } from 'mongoose'

const workspaceTeamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: 'My Workspace',
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    members: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true },
)

export type WorkspaceTeamDocument = InferSchemaType<
  typeof workspaceTeamSchema
>

export default model('WorkspaceTeam', workspaceTeamSchema)
