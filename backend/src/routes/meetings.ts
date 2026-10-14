
import { Router, type Request, type Response } from 'express'
import Meeting from '../Models/Meeting'

const router = Router()

// GET /api/meetings — get all meetings from MongoDB
router.get('/', async (_req: Request, res: Response) => {
  try {
    const meetings = await Meeting.find().sort({
      date: 1,
      time: 1,
    })

    res.status(200).json(meetings)
  } catch (error) {
    console.error('Could not fetch meetings:', error)

    res.status(500).json({
      message: 'Could not fetch meetings.',
    })
  }
})

// POST /api/meetings — create a new meeting
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, date, time } = req.body as {
      title?: string
      date?: string
      time?: string
    }

    // Validate the required fields.
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.trim().length > 100 ||
      typeof date !== 'string' ||
      !date ||
      typeof time !== 'string' ||
      !time
    ) {
      res.status(400).json({
        message:
          'Please provide a meeting title (maximum 100 characters), date, and time.',
      })
      return
    }

    // Validate date and time format.
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      res.status(400).json({
        message: 'Please provide a valid date and time.',
      })
      return
    }

    const meetingDateTime = new Date(`${date}T${time}`)

    // Reject invalid or past meeting dates.
    if (
      Number.isNaN(meetingDateTime.getTime()) ||
      meetingDateTime.getFullYear() !== Number(date.slice(0, 4)) ||
      meetingDateTime.getMonth() + 1 !== Number(date.slice(5, 7)) ||
      meetingDateTime.getDate() !== Number(date.slice(8, 10)) ||
      meetingDateTime.getHours() !== Number(time.slice(0, 2)) ||
      meetingDateTime.getMinutes() !== Number(time.slice(3, 5)) ||
      meetingDateTime.getTime() <= Date.now()
    ) {
      res.status(400).json({
        message: 'Please select a valid future date and time.',
      })
      return
    }

    // Save the meeting in MongoDB.
    const meeting = await Meeting.create({
      title: title.trim(),
      date,
      time,
    })

    res.status(201).json(meeting)
  } catch (error) {
    console.error('Could not create meeting:', error)

    res.status(500).json({
      message: 'Could not create meeting.',
    })
  }
})

// DELETE /api/meetings/:id — delete a meeting from MongoDB
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId

    // Validate the MongoDB ObjectId.
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
      res.status(400).json({
        message: 'Invalid meeting ID.',
      })
      return
    }

    // Find and delete the meeting.
    const deletedMeeting = await Meeting.findByIdAndDelete(id)

    if (!deletedMeeting) {
      res.status(404).json({
        message: 'Meeting not found.',
      })
      return
    }

    res.status(200).json({
      message: 'Meeting deleted successfully.',
    })
  } catch (error) {
    console.error('Could not delete meeting:', error)

    res.status(500).json({
      message: 'Could not delete meeting.',
    })
  }
})

export default router
