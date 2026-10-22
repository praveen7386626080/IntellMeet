
import { Router, type Request, type Response } from 'express'
import Transcript from '../Models/Transcript'
import Meeting from '../Models/Meeting'

const router = Router()

// POST /api/transcripts — save a transcript segment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { meetingId, text, speaker, timestamp } = req.body as {
      meetingId?: string
      text?: string
      speaker?: string
      timestamp?: string
    }

    if (
      typeof meetingId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(meetingId) ||
      typeof text !== 'string' ||
      !text.trim()
    ) {
      res.status(400).json({
        message: 'A valid meetingId and non-empty transcript text are required.',
      })
      return
    }

    const meeting = await Meeting.findById(meetingId)

    if (!meeting) {
      res.status(404).json({ message: 'Meeting not found.' })
      return
    }

    const parsedTimestamp = timestamp ? new Date(timestamp) : new Date()

    if (Number.isNaN(parsedTimestamp.getTime())) {
      res.status(400).json({ message: 'Invalid timestamp.' })
      return
    }

    const transcript = await Transcript.create({
      meetingId,
      text: text.trim(),
      speaker:
        typeof speaker === 'string' && speaker.trim()
          ? speaker.trim().slice(0, 100)
          : 'Unknown',
      timestamp: parsedTimestamp,
    })

    res.status(201).json(transcript)
  } catch (error) {
    console.error('Could not save transcript:', error)
    res.status(500).json({ message: 'Could not save transcript.' })
  }
})

// GET /api/transcripts/:meetingId — recover a meeting transcript
router.get('/:meetingId', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.meetingId
    const meetingId = Array.isArray(rawId) ? rawId[0] : rawId

    if (typeof meetingId !== 'string' || !/^[a-f\d]{24}$/i.test(meetingId)) {
      res.status(400).json({ message: 'Invalid meeting ID.' })
      return
    }

    const meeting = await Meeting.findById(meetingId)

    if (!meeting) {
      res.status(404).json({ message: 'Meeting not found.' })
      return
    }

    const transcripts = await Transcript.find({ meetingId })
      .sort({ timestamp: 1, _id: 1 })
      .lean()

    res.status(200).json(transcripts)
  } catch (error) {
    console.error('Could not fetch transcript:', error)
    res.status(500).json({ message: 'Could not fetch transcript.' })
  }
})

export default router
