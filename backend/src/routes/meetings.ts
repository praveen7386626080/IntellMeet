
import { Router, type Response } from 'express'
import Meeting from '../Models/Meeting'
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/requireAuth'

const router = Router()

interface MeetingSummary {
  summary: string
  keyDecisions: string[]
  actionItems: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateSummary(value: unknown): MeetingSummary | null {
  if (!isRecord(value) || typeof value.summary !== 'string') {
    return null
  }

  const keyDecisions = Array.isArray(value.keyDecisions)
    ? value.keyDecisions
    : []

  const actionItems = Array.isArray(value.actionItems)
    ? value.actionItems
    : []

  if (
    !keyDecisions.every((item) => typeof item === 'string') ||
    !actionItems.every((item) => typeof item === 'string')
  ) {
    return null
  }

  const summary = value.summary.trim()

  if (!summary) {
    return null
  }

  return {
    summary,
    keyDecisions,
    actionItems,
  }
}

function parseJsonText(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')

    if (start === -1 || end <= start) {
      return null
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function parseGeneratedSummary(value: unknown): MeetingSummary | null {
  if (!isRecord(value)) {
    return null
  }

  if (typeof value.response === 'string') {
    return validateSummary(parseJsonText(value.response))
  }

  if (isRecord(value.message) && typeof value.message.content === 'string') {
    return validateSummary(parseJsonText(value.message.content))
  }

  return validateSummary(value)
}

// GET /api/meetings — get meetings belonging to the logged-in user
router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const meetings = await Meeting.find({
        createdBy: req.userId,
      }).sort({
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
  },
)

// POST /api/meetings — create a new meeting
router.post(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, date, time } = req.body as {
        title?: string
        date?: string
        time?: string
      }

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

      const meeting = await Meeting.create({
        title: title.trim(),
        date,
        time,
        createdBy: req.userId,
      })

      res.status(201).json(meeting)
    } catch (error) {
      console.error('Could not create meeting:', error)

      res.status(500).json({
        message: 'Could not create meeting.',
      })
    }
  },
)

// GET /api/meetings/:id/transcript — load a saved transcript
router.get(
  '/:id/transcript',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId

      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        res.status(400).json({
          message: 'Invalid meeting ID.',
        })
        return
      }

      const meeting = await Meeting.findOne({
        _id: id,
        createdBy: req.userId,
      }).select('transcript')

      if (!meeting) {
        res.status(404).json({
          message: 'Meeting not found.',
        })
        return
      }

      res.status(200).json({
        transcript: meeting.transcript ?? '',
      })
    } catch (error) {
      console.error('Could not fetch transcript:', error)

      res.status(500).json({
        message: 'Could not fetch transcript.',
      })
    }
  },
)

// PUT /api/meetings/:id/transcript — save or update a transcript
router.put(
  '/:id/transcript',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId

      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        res.status(400).json({
          message: 'Invalid meeting ID.',
        })
        return
      }

      const { transcript } = req.body as {
        transcript?: unknown
      }

      if (
        typeof transcript !== 'string' ||
        transcript.length > 500_000
      ) {
        res.status(400).json({
          message:
            'Transcript must be text and no longer than 500,000 characters.',
        })
        return
      }

      const meeting = await Meeting.findOneAndUpdate(
        {
          _id: id,
          createdBy: req.userId,
        },
        {
          $set: { transcript },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      ).select('transcript')

      if (!meeting) {
        res.status(404).json({
          message: 'Meeting not found.',
        })
        return
      }

      res.status(200).json({
        message: 'Transcript saved successfully.',
        transcript: meeting.transcript ?? '',
      })
    } catch (error) {
      console.error('Could not save transcript:', error)

      res.status(500).json({
        message: 'Could not save transcript.',
      })
    }
  },
)

// GET /api/meetings/:id/summary — load a previously saved AI summary
router.get(
  '/:id/summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId

      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        res.status(400).json({
          message: 'Invalid meeting ID.',
        })
        return
      }

      const meeting = await Meeting.findOne({
        _id: id,
        createdBy: req.userId,
      }).select('summary keyDecisions actionItems summaryGeneratedAt')

      if (!meeting) {
        res.status(404).json({
          message: 'Meeting not found.',
        })
        return
      }

      res.status(200).json({
        summary: meeting.summary ?? '',
        keyDecisions: meeting.keyDecisions ?? [],
        actionItems: meeting.actionItems ?? [],
        summaryGeneratedAt: meeting.summaryGeneratedAt ?? null,
      })
    } catch (error) {
      console.error('Could not fetch meeting summary:', error)

      res.status(500).json({
        message: 'Could not fetch the saved meeting summary.',
      })
    }
  },
)

// POST /api/meetings/:id/summary — generate and save an AI meeting summary
router.post(
  '/:id/summary',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId

      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        res.status(400).json({
          message: 'Invalid meeting ID.',
        })
        return
      }

      const meeting = await Meeting.findOne({
        _id: id,
        createdBy: req.userId,
      }).select('title transcript')

      if (!meeting) {
        res.status(404).json({
          message: 'Meeting not found.',
        })
        return
      }

      const transcript = meeting.transcript?.trim()

      if (!transcript) {
        res.status(400).json({
          message: 'Add a transcript before generating a meeting summary.',
        })
        return
      }

      const ollamaUrl = (
        process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      ).replace(/\/+$/, '')

      const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b'

      let ollamaResponse: globalThis.Response

      try {
        ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            stream: false,
            format: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                keyDecisions: {
                  type: 'array',
                  items: { type: 'string' },
                },
                actionItems: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['summary', 'keyDecisions', 'actionItems'],
              additionalProperties: false,
            },
            options: {
              temperature: 0.2,
            },
            prompt: `You are an assistant that writes accurate meeting summaries.

Return only a valid JSON object with exactly these fields:
{
  "summary": "A concise summary of the meeting",
  "keyDecisions": ["Decision 1"],
  "actionItems": ["Action item 1"]
}

Rules:
- Use only information present in the transcript.
- Do not invent names, decisions, dates, or tasks.
- If there are no key decisions, return an empty keyDecisions array.
- If there are no action items, return an empty actionItems array.
- The summary must be a meaningful, non-empty string.

Meeting title: ${meeting.title}

Meeting transcript:
${transcript}`,
          }),
          signal: AbortSignal.timeout(120_000),
        })
      } catch (error) {
        console.error('Could not reach Ollama:', error)

        res.status(503).json({
          message:
            'Could not reach Ollama. Start Ollama and make sure the configured model is available.',
        })
        return
      }

      if (!ollamaResponse.ok) {
        const detail = await ollamaResponse.text()

        console.error(
          `Ollama returned ${ollamaResponse.status}:`,
          detail,
        )

        res.status(502).json({
          message: `Ollama could not generate the summary. Check that the model "${model}" is installed and running.`,
        })
        return
      }

      let generatedData: unknown

      try {
        generatedData = await ollamaResponse.json()
      } catch (error) {
        console.error('Ollama returned invalid JSON:', error)

        res.status(502).json({
          message: 'Ollama returned an invalid response.',
        })
        return
      }

      const generatedSummary = parseGeneratedSummary(generatedData)

      if (!generatedSummary) {
        console.error(
          'Ollama returned an invalid meeting summary. Response:',
          JSON.stringify(generatedData).slice(0, 3000),
        )

        res.status(502).json({
          message:
            'Ollama could not create a valid summary. Check the backend terminal for the model response.',
        })
        return
      }

      const savedMeeting = await Meeting.findOneAndUpdate(
        {
          _id: id,
          createdBy: req.userId,
        },
        {
          $set: {
            ...generatedSummary,
            summaryGeneratedAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      ).select('summary keyDecisions actionItems summaryGeneratedAt')

      if (!savedMeeting) {
        res.status(404).json({
          message: 'Meeting not found.',
        })
        return
      }

      res.status(200).json({
        summary: savedMeeting.summary,
        keyDecisions: savedMeeting.keyDecisions,
        actionItems: savedMeeting.actionItems,
        summaryGeneratedAt: savedMeeting.summaryGeneratedAt,
      })
    } catch (error) {
      console.error('Could not generate meeting summary:', error)

      res.status(500).json({
        message: 'Could not generate the AI meeting summary.',
      })
    }
  },
)

// DELETE /api/meetings/:id — delete a meeting owned by the logged-in user
router.delete(
  '/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawId = req.params.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId

      if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
        res.status(400).json({
          message: 'Invalid meeting ID.',
        })
        return
      }

      const deletedMeeting = await Meeting.findOneAndDelete({
        _id: id,
        createdBy: req.userId,
      })

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
  },
)

export default router
