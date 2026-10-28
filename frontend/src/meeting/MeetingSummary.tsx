
import { useState, useEffect } from 'react'
import './MeetingSummary.css'

interface MeetingSummaryProps {
  meetingId?: string
  transcript: string
}

interface SummaryResult {
  summary: string
  keyDecisions: string[]
  actionItems: string[]
  summaryGeneratedAt?: string | null
}

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/meetings`
const TOKEN_KEY = 'intellmeet-access-token'

export default function MeetingSummary({
  meetingId,
  transcript,
}: MeetingSummaryProps) {
  const [result, setResult] = useState<SummaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Load previously saved summary whenever the meeting opens.
  useEffect(() => {
    let cancelled = false

    async function loadSavedSummary() {
      setResult(null)
      setError('')
      setNotice('')

      if (!meetingId || !/^[a-f\d]{24}$/i.test(meetingId)) {
        return
      }

      const token = localStorage.getItem(TOKEN_KEY)

      if (!token) {
        setError('Please log in again to view your saved summary.')
        return
      }

      setFetching(true)

      try {
        const response = await fetch(
          `${API_URL}/${encodeURIComponent(meetingId)}/summary`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        )

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            data.message || 'Could not load the saved meeting summary.',
          )
        }

        if (
          typeof data.summary !== 'string' ||
          !Array.isArray(data.keyDecisions) ||
          !Array.isArray(data.actionItems)
        ) {
          throw new Error('The server returned an invalid saved summary.')
        }

        if (cancelled) return

        if (data.summary.trim()) {
          setResult({
            summary: data.summary,
            keyDecisions: data.keyDecisions,
            actionItems: data.actionItems,
            summaryGeneratedAt: data.summaryGeneratedAt ?? null,
          })
          setNotice('Previously saved AI summary loaded successfully.')
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load the saved meeting summary.',
          )
        }
      } finally {
        if (!cancelled) {
          setFetching(false)
        }
      }
    }

    loadSavedSummary()

    return () => {
      cancelled = true
    }
  }, [meetingId])

  async function generateSummary() {
    setError('')
    setNotice('')

    const token = localStorage.getItem(TOKEN_KEY)

    if (!token) {
      setError('Please log in again to generate an AI summary.')
      return
    }

    if (!meetingId || !/^[a-f\d]{24}$/i.test(meetingId)) {
      setError(
        'This meeting does not have a valid saved meeting ID. Open a scheduled meeting from your dashboard.',
      )
      return
    }

    if (!transcript.trim()) {
      setError(
        'There is no transcript to summarize. Start transcription and speak during your meeting first.',
      )
      return
    }

    setLoading(true)

    try {
      const transcriptResponse = await fetch(
        `${API_URL}/${encodeURIComponent(meetingId)}/transcript`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ transcript }),
        },
      )

      const transcriptData = await transcriptResponse.json().catch(() => ({}))

      if (!transcriptResponse.ok) {
        throw new Error(
          transcriptData.message || 'Could not save the meeting transcript.',
        )
      }

      const response = await fetch(
        `${API_URL}/${encodeURIComponent(meetingId)}/summary`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not generate the AI meeting summary.',
        )
      }

      if (
        typeof data.summary !== 'string' ||
        !Array.isArray(data.keyDecisions) ||
        !Array.isArray(data.actionItems)
      ) {
        throw new Error('The server returned an invalid summary response.')
      }

      setResult({
        summary: data.summary,
        keyDecisions: data.keyDecisions,
        actionItems: data.actionItems,
        summaryGeneratedAt: data.summaryGeneratedAt ?? null,
      })

      setNotice('AI summary generated and saved successfully.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while generating the summary.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ai-summary-panel">
      <div className="ai-summary-toolbar">
        <p className="ai-summary-hint">
          Generate meeting notes from the transcript using your local AI model.
        </p>

        <span className="ai-summary-badge">AI Powered</span>

        <button
          type="button"
          className="ai-summary-button"
          onClick={generateSummary}
          disabled={loading || fetching}
        >
          {loading
            ? 'Generating summary…'
            : fetching
              ? 'Loading saved summary…'
              : '✨ Generate AI Summary'}
        </button>
      </div>

      {fetching && (
        <p className="ai-summary-status" role="status">
          Checking for a previously saved meeting summary…
        </p>
      )}

      {loading && (
        <p className="ai-summary-status" role="status">
          Your transcript is being analyzed. This may take a little time.
        </p>
      )}

      {notice && (
        <p className="ai-summary-success" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="ai-summary-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="ai-summary-results">
          <article className="ai-summary-card ai-summary-card--wide">
            <h3>📝 Meeting Summary</h3>
            <p>{result.summary}</p>
          </article>

          <article className="ai-summary-card">
            <h3>🎯 Key Decisions</h3>

            {result.keyDecisions.length > 0 ? (
              <ul>
                {result.keyDecisions.map((decision, index) => (
                  <li key={`${index}-${decision}`}>{decision}</li>
                ))}
              </ul>
            ) : (
              <p>No specific decisions were identified.</p>
            )}
          </article>

          <article className="ai-summary-card">
            <h3>✅ Action Items</h3>

            {result.actionItems.length > 0 ? (
              <ul>
                {result.actionItems.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No specific action items were identified.</p>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
