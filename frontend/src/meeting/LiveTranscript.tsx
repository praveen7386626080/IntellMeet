
import { useEffect, useRef, useState } from 'react'
import './LiveTranscript.css'
import MeetingSummary from './MeetingSummary'

export interface SavedMeetingSummary {
  id: string
  title: string
  date: string
  time: string
  summary?: string
  keyDecisions?: string[]
  actionItems?: string[]
  summaryGeneratedAt?: string | null
}

interface LiveTranscriptProps {
  meetingId?: string
  summaryTabRequest?: number
  savedSummaries?: SavedMeetingSummary[]
  loadingSummaries?: boolean
  formatDate?: (date: string) => string
  onOpenSummary?: (meeting: SavedMeetingSummary) => void
  onDownloadSummary?: (meeting: SavedMeetingSummary) => void
}

type SpeechRecognitionAlternative = {
  transcript: string
}

type SpeechRecognitionResult = {
  0: SpeechRecognitionAlternative
  isFinal: boolean
}

type SpeechRecognitionEvent = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResult>
}

type SpeechRecognitionErrorEvent = {
  error: string
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const API_URL = `${
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
}/meetings`

const TOKEN_KEY = 'intellmeet-access-token'

export default function LiveTranscript({
  meetingId,
  summaryTabRequest = 0,
  savedSummaries = [],
  loadingSummaries = false,
  formatDate,
  onOpenSummary,
  onDownloadSummary,
}: LiveTranscriptProps) {
  const [selectedView, setSelectedView] = useState<'transcript' | 'summary'>(
    'transcript',
  )
  const [
    handledSummaryTabRequest,
    setHandledSummaryTabRequest,
  ] = useState(0)
  const activeView =
    summaryTabRequest > handledSummaryTabRequest
      ? 'summary'
      : selectedView

  const [token] = useState(() => localStorage.getItem(TOKEN_KEY))

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState('')
  const [loadingTranscript, setLoadingTranscript] = useState(
    Boolean(meetingId && token),
  )
  const [saveStatus, setSaveStatus] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const shouldListenRef = useRef(false)
  const loadedMeetingIdRef = useRef('')
  const loadingMeetingIdRef = useRef<string | undefined>(meetingId)

  function selectView(view: 'transcript' | 'summary') {
    setSelectedView(view)
    setHandledSummaryTabRequest(summaryTabRequest)
  }

  // Stop speech recognition when the component unmounts.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  // Load the saved transcript whenever the meeting changes.
  useEffect(() => {
    const controller = new AbortController()

    loadedMeetingIdRef.current = ''
    loadingMeetingIdRef.current = meetingId

    async function loadTranscript() {
      if (!meetingId || !token) {
        setTranscript('')
        setInterimText('')
        setError(
          meetingId
            ? 'Authentication token not found. Please log in again.'
            : '',
        )
        setSaveStatus('')
        setLoadingTranscript(false)
        return
      }

      setLoadingTranscript(true)

      try {
        const response = await fetch(
          `${API_URL}/${encodeURIComponent(meetingId)}/transcript`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        )

        const data = (await response.json()) as {
          transcript?: string
          message?: string
        }

        if (!response.ok) {
          throw new Error(
            data.message || 'Could not load the saved transcript.',
          )
        }

        if (typeof data.transcript !== 'string') {
          throw new Error('The server returned an invalid transcript.')
        }

        if (controller.signal.aborted) return

        loadedMeetingIdRef.current = meetingId

        setTranscript(data.transcript)
        setInterimText('')
        setError('')
        setSaveStatus('')
      } catch (err) {
        if (controller.signal.aborted) return

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the saved transcript.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTranscript(false)
        }
      }
    }

    void loadTranscript()

    return () => {
      controller.abort()
    }
  }, [meetingId, token])

  // Automatically save transcript changes after the user pauses.
  useEffect(() => {
    if (
      !meetingId ||
      !token ||
      loadedMeetingIdRef.current !== meetingId ||
      loadingMeetingIdRef.current !== meetingId
    ) {
      return
    }

    const controller = new AbortController()

    const timeoutId = window.setTimeout(async () => {
      try {
        setSaveStatus('Saving…')

        const response = await fetch(
          `${API_URL}/${encodeURIComponent(meetingId)}/transcript`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ transcript }),
            signal: controller.signal,
          },
        )

        const data = (await response.json()) as {
          message?: string
        }

        if (!response.ok) {
          throw new Error(
            data.message || 'Could not save the transcript.',
          )
        }

        if (controller.signal.aborted) return

        setSaveStatus('Saved to MongoDB')
        setError('')
      } catch (err) {
        if (controller.signal.aborted) return

        setSaveStatus('Save failed')
        setError(
          err instanceof Error
            ? err.message
            : 'Could not save the transcript.',
        )
      }
    }, 800)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [transcript, meetingId, token])

  // Keep the newest words in view while the transcript grows.
  useEffect(() => {
    if (!isListening) return

    const el = contentRef.current

    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [transcript, interimText, isListening])

  // Start browser-based speech recognition.
  function startTranscription() {
    setError('')

    if (meetingId && loadingTranscript) {
      setError('Please wait for the saved transcript to load.')
      return
    }

    const speechWindow = window as SpeechWindow

    const SpeechRecognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError(
        'Speech recognition is not supported in this browser. Try Microsoft Edge or Google Chrome.',
      )
      return
    }

    if (recognitionRef.current) {
      shouldListenRef.current = false
      recognitionRef.current.abort()
    }

    const recognition = new SpeechRecognition()

    recognition.lang = 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let temporaryText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const spokenText = result[0].transcript

        if (result.isFinal) {
          finalText += spokenText
        } else {
          temporaryText += spokenText
        }
      }

      if (finalText.trim()) {
        setTranscript((previous) =>
          `${previous}${previous ? ' ' : ''}${finalText.trim()}`,
        )
      }

      setInterimText(temporaryText)
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError(
          'Microphone access was denied. Allow microphone access in your browser settings.',
        )
        shouldListenRef.current = false
        setIsListening(false)
      } else if (
        event.error !== 'no-speech' &&
        event.error !== 'aborted'
      ) {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start()
        } catch {
          // Recognition may already be restarting.
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    shouldListenRef.current = true

    try {
      recognition.start()
      setIsListening(true)
    } catch {
      shouldListenRef.current = false
      setIsListening(false)
      setError('Could not start transcription. Please try again.')
    }
  }

  // Stop speech recognition.
  function stopTranscription() {
    shouldListenRef.current = false
    recognitionRef.current?.stop()
    setIsListening(false)
    setInterimText('')
  }

  // Clear the current transcript.
  function clearTranscript() {
    const confirmed = window.confirm(
      'Are you sure you want to clear the transcript? The empty transcript will be saved to this meeting.',
    )

    if (!confirmed) return

    setTranscript('')
    setInterimText('')
    setError('')
    setSaveStatus('')
  }

  // Download transcript as a separate text file.
  function downloadTranscript() {
    const text = transcript.trim()

    if (!text) {
      setError('There is no transcript to download yet.')
      return
    }

    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `intellmeet-transcript-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`

    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(url)
  }

  const saveFailed = saveStatus === 'Save failed'
  const saveLabel = saveStatus === 'Saved to MongoDB' ? 'Saved' : saveStatus

  return (
    <section className="transcript-panel">
      <div className="transcript-topbar">
        <div
          className="transcript-view-tabs"
          role="tablist"
          aria-label="Meeting notes views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'transcript'}
            className={activeView === 'transcript' ? 'active' : ''}
            onClick={() => selectView('transcript')}
          >
            Live Transcript
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'summary'}
            className={activeView === 'summary' ? 'active' : ''}
            onClick={() => selectView('summary')}
          >
            AI Summary &amp; Action Items
          </button>
        </div>

        {activeView === 'transcript' && (
          <span
            className={`transcript-status ${isListening ? 'active' : ''}`}
          >
            {isListening ? 'Listening' : 'Stopped'}
          </span>
        )}
      </div>

      {activeView === 'transcript' ? (
        <>
          <div className="transcript-controls">
            {!isListening ? (
              <button
                type="button"
                onClick={startTranscription}
                className="transcript-start"
                disabled={loadingTranscript}
              >
                Start transcription
              </button>
            ) : (
              <button
                type="button"
                onClick={stopTranscription}
                className="transcript-stop"
              >
                Stop transcription
              </button>
            )}

            <button
              type="button"
              onClick={downloadTranscript}
              className="transcript-secondary"
            >
              Download text
            </button>

            <button
              type="button"
              onClick={clearTranscript}
              className="transcript-secondary"
              disabled={loadingTranscript}
            >
              Clear
            </button>

            {meetingId && saveLabel && (
              <span
                className={`transcript-save ${saveFailed ? 'is-error' : ''}`}
                role="status"
              >
                {saveLabel}
              </span>
            )}
          </div>

          {loadingTranscript && meetingId && (
            <p className="transcript-note">
              Loading saved transcript…
            </p>
          )}

          {error && (
            <p className="transcript-error" role="alert">
              {error}
            </p>
          )}

          <div
            className="transcript-content"
            aria-live="polite"
            ref={contentRef}
          >
            {transcript || interimText ? (
              <>
                {transcript && <p>{transcript}</p>}

                {interimText && (
                  <p className="transcript-interim">
                    {interimText}
                  </p>
                )}
              </>
            ) : (
              <p className="transcript-empty">
                Click “Start transcription”, allow microphone access, and
                speak clearly. Your recognized words will appear here.
              </p>
            )}
          </div>

          <p className="transcript-note transcript-footnote">
            {meetingId
              ? 'Free browser speech recognition · automatically saved to this meeting.'
              : 'Free browser speech recognition · open a meeting room to enable saving.'}
          </p>
        </>
      ) : (
        <div className="transcript-view-body">
          {meetingId && (
            <MeetingSummary
              meetingId={meetingId}
              transcript={transcript}
            />
          )}

          {!meetingId && (
            <p className="transcript-note">
              Your saved AI-generated meeting insights appear below.
            </p>
          )}

          <section className="saved-summaries-inside-tab">
            <div className="panel-heading">
              <div>
                <h3>Recent Meeting Summaries</h3>
                <p>Your saved AI-generated meeting insights</p>
              </div>

              <span className="summary-count">
                {savedSummaries.length} saved
              </span>
            </div>

            {loadingSummaries ? (
              <div className="summary-empty-state">
                Loading meeting summaries...
              </div>
            ) : savedSummaries.length === 0 ? (
              <div className="summary-empty-state">
                <div className="summary-empty-icon">✦</div>
                <h3>No AI summaries yet</h3>
                <p>
                  Generate an AI summary from a meeting to see it here.
                </p>
              </div>
            ) : (
              <div className="recent-summaries-list">
                {savedSummaries.map((meeting) => (
                  <article
                    className="recent-summary-card"
                    key={meeting.id}
                  >
                    <div className="recent-summary-top">
                      <div>
                        <h4>{meeting.title}</h4>
                        <p>
                          {formatDate
                            ? formatDate(meeting.date)
                            : meeting.date}
                          {' · '}
                          {meeting.time}
                        </p>
                      </div>

                      <span className="ai-summary-label">
                        ✦ AI Summary
                      </span>
                    </div>

                    <p className="recent-summary-preview">
                      {meeting.summary}
                    </p>

                    <div className="summary-meta">
                      <span>
                        {meeting.keyDecisions?.length || 0} key decisions
                      </span>

                      <span>
                        {meeting.actionItems?.length || 0} action items
                      </span>
                    </div>

                    <div className="recent-summary-actions">
                      {onOpenSummary && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onOpenSummary(meeting)}
                        >
                          Open Meeting
                        </button>
                      )}

                      {onDownloadSummary && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => onDownloadSummary(meeting)}
                        >
                          ↓ Download AI Summary
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
