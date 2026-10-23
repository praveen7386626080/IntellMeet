
import { Router } from 'express'
import multer from 'multer'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
})

router.post('/transcribe', (req, res, next) => {
  upload.single('audio')(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Audio file must be 25 MB or smaller.'
            : 'Unable to process the uploaded audio.'

        res.status(400).json({ error: message })
        return
      }

      next(error)
      return
    }

    void (async () => {
      const audio = req.file

      if (!audio) {
        res.status(400).json({
          error: 'Please upload an audio file using the audio field.',
        })
        return
      }

      try {
        const formData = new FormData()

        formData.append(
          'audio',
          new Blob([new Uint8Array(audio.buffer)], {
            type: audio.mimetype || 'application/octet-stream',
          }),
          audio.originalname || 'audio.webm',
        )

        const response = await fetch(
          'http://127.0.0.1:5001/transcribe',
          {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(120000),
          },
        )

        const result: unknown = await response.json()

        if (!response.ok) {
          console.error('Whisper service returned an error.')
          res.status(502).json({
            error: 'Transcription service could not process the audio.',
          })
          return
        }

        res.json(result)
      } catch (error) {
        console.error('Transcription request failed:', error)

        res.status(502).json({
          error:
            'Could not reach Whisper. Please check that the transcription service is running.',
        })
      }
    })()
  })
})

export default router
