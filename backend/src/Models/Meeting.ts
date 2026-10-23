import { Schema, model, type InferSchemaType } from 'mongoose'

const meetingSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    date: {
      type: String,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    transcript: {
      type: String,
      default: '',
    },

    // AI-generated meeting summary
    summary: {
      type: String,
      default: '',
    },

    // Important decisions identified by AI
    keyDecisions: {
      type: [String],
      default: [],
    },

    // Tasks identified by AI
    actionItems: {
      type: [String],
      default: [],
    },

    // Date and time when the AI summary was generated
    summaryGeneratedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
)

export type MeetingDocument = InferSchemaType<typeof meetingSchema>

export default model('Meeting', meetingSchema)