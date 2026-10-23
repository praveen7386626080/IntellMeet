
import { Schema, model } from 'mongoose'

const transcriptSchema = new Schema(
  {
    meetingId: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    speaker: {
      type: String,
      default: 'Unknown',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

transcriptSchema.index({ meetingId: 1, timestamp: 1 })

export default model('Transcript', transcriptSchema)
