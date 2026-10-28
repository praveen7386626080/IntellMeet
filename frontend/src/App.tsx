
import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import MeetingRoom from './meeting/MeetingRoom'
import LiveTranscript from './meeting/LiveTranscript'
import { useAuth } from './auth/AuthContext'
import ProfilePage from './auth/ProfilePage'
import WorkspacePage, {
  type WorkspaceSection,
} from './workspace/WorkspacePage'

type Meeting = {
  id: string
  title: string
  date: string
  time: string
}

type ApiMeeting = {
  _id: string
  title: string
  date: string
  time: string
}

type DashboardAnalytics = {
  todoTaskCount: number
  inProgressTaskCount: number
  activeProjectCount: number
  summaryCount: number
}

const API_URL = `${
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
}/meetings`
const WORKSPACE_API_URL = `${
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
}/workspace`

const menuItems = [
  'Dashboard',
  'Meetings',
  'Messages',
  'My Tasks',
  'Projects',
  'Team',
  'Analytics',
  'Profile',
]

function getToday() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMeetingIdFromInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  let roomId = value

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      const queryMeeting = url.searchParams.get('meeting')

      if (queryMeeting) {
        roomId = queryMeeting
      } else {
        const segments = url.pathname.split('/').filter(Boolean)
        roomId = segments[segments.length - 1] ?? ''
      }
    } catch {
      return null
    }
  }

  if (
    roomId.length > 100 ||
    !/^[a-zA-Z0-9_-]+$/.test(roomId)
  ) {
    return null
  }

  return roomId
}

function App() {
  const { token, user } = useAuth()

  // Theme preference: saved in localStorage.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('intellmeet-theme')
    return savedTheme === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('intellmeet-theme', theme)
  }, [theme])

  const [activePage, setActivePage] = useState('Dashboard')
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)

  const [meetingTitle, setMeetingTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [meetingCode, setMeetingCode] = useState('')

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)
  const [dashboardAnalytics, setDashboardAnalytics] =
    useState<DashboardAnalytics | null>(null)
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [deletingMeetingId, setDeletingMeetingId] =
    useState<string | null>(null)

  // Read the meeting room from the URL during initial state setup.
  // This avoids calling setState synchronously inside an effect.
  const [activeMeetingRoom, setActiveMeetingRoom] =
    useState<string | null>(() => {
      const params = new URLSearchParams(window.location.search)
      const roomId = params.get('meeting')

      return roomId && getMeetingIdFromInput(roomId)
        ? roomId
        : null
    })

  // Store the current time in state so render calculations stay pure.
  const [currentTime, setCurrentTime] = useState(0)

  const nextNoticeId = useRef(0)

  const [notice, setNotice] = useState<{
    id: number
    message: string
  } | null>(null)

  const [errorMessage, setErrorMessage] = useState('')

  // Update the current time outside the render calculation.
  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setCurrentTime(Date.now())
    }, 0)

    const interval = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
    }
  }, [])

  // Automatically dismiss notifications.
  useEffect(() => {
    if (!notice) return

    const timer = window.setTimeout(() => {
      setNotice((current) =>
        current?.id === notice.id ? null : current,
      )
    }, 5000)

    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!errorMessage) return

    const timer = window.setTimeout(() => {
      setErrorMessage('')
    }, 6000)

    return () => window.clearTimeout(timer)
  }, [errorMessage])

  // Load the signed-in user's meetings saved in MongoDB.
  useEffect(() => {
    const controller = new AbortController()

    async function loadMeetings() {
      if (!token) {
        setMeetings([])
        setLoadingMeetings(false)
        return
      }

      setLoadingMeetings(true)

      try {
        const response = await fetch(API_URL, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Could not load meetings from the server.')
        }

        const data: ApiMeeting[] = await response.json()

        setMeetings(
          data.map((item) => ({
            id: item._id,
            title: item.title,
            date: item.date,
            time: item.time,
          })),
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        setErrorMessage(
          'Unable to load meetings. Please check that the backend is running.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMeetings(false)
        }
      }
    }

    void loadMeetings()

    return () => controller.abort()
  }, [token])

  useEffect(() => {
    if (!token || activePage !== 'Dashboard') return

    const controller = new AbortController()

    async function loadDashboardAnalytics() {
      try {
        const response = await fetch(`${WORKSPACE_API_URL}/analytics`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Could not load workspace analytics.')
        }

        const data: DashboardAnalytics = await response.json()
        setDashboardAnalytics(data)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return

        setErrorMessage(
          'Unable to load workspace analytics. Please check the backend connection.',
        )
      }
    }

    void loadDashboardAnalytics()

    return () => controller.abort()
  }, [activePage, token])

  // Filter and sort upcoming meetings using state instead of Date.now().
  const upcomingMeetings = meetings
    .filter(
      (meeting) =>
        new Date(`${meeting.date}T${meeting.time}`).getTime() >=
        currentTime,
    )
    .sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}`).getTime() -
        new Date(`${b.date}T${b.time}`).getTime(),
    )

  function showSuccess(message: string) {
    setNotice({
      id: ++nextNoticeId.current,
      message,
    })
  }

  function dismissMessages() {
    setNotice(null)
    setErrorMessage('')
  }

  function openCreateMeeting() {
    dismissMessages()
    setShowJoinForm(false)
    setShowMeetingForm(true)
  }

  function closeCreateMeeting() {
    setShowMeetingForm(false)
    setErrorMessage('')
  }

  function openJoinMeeting() {
    dismissMessages()
    setShowMeetingForm(false)
    setShowJoinForm(true)
  }

  // Save a meeting through the Express API.
  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    dismissMessages()

    if (!meetingTitle.trim() || !meetingDate || !meetingTime) {
      setErrorMessage('Please fill in all meeting details.')
      return
    }

    const meetingDateTime = new Date(
      `${meetingDate}T${meetingTime}`,
    )

    if (Number.isNaN(meetingDateTime.getTime())) {
      setErrorMessage('Please enter a valid date and time.')
      return
    }

    if (meetingDateTime.getTime() <= Date.now()) {
      setErrorMessage('Please select a future date and time.')
      return
    }

    setSavingMeeting(true)

    try {
      if (!token) {
        throw new Error('Please log in before creating a meeting.')
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: meetingTitle.trim(),
          date: meetingDate,
          time: meetingTime,
        }),
      })

      const result: ApiMeeting | { message?: string } =
        await response.json()

      if (!response.ok) {
        throw new Error(
          'message' in result && result.message
            ? result.message
            : 'Could not create meeting.',
        )
      }

      const savedMeeting = result as ApiMeeting

      const newMeeting: Meeting = {
        id: savedMeeting._id,
        title: savedMeeting.title,
        date: savedMeeting.date,
        time: savedMeeting.time,
      }

      setMeetings((current) =>
        [...current, newMeeting].sort(
          (a, b) =>
            new Date(`${a.date}T${a.time}`).getTime() -
            new Date(`${b.date}T${b.time}`).getTime(),
        ),
      )

      setMeetingTitle('')
      setMeetingDate('')
      setMeetingTime('')
      setShowMeetingForm(false)
      setActivePage('Meetings')

      showSuccess(`"${newMeeting.title}" was saved successfully.`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not connect to the backend.',
      )
    } finally {
      setSavingMeeting(false)
    }
  }

  // Delete a meeting from MongoDB.
  async function deleteMeeting(meeting: Meeting) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${meeting.title}"? This cannot be undone.`,
    )

    if (!confirmed) return

    dismissMessages()
    setDeletingMeetingId(meeting.id)

    try {
      if (!token) {
        throw new Error('Please log in before deleting a meeting.')
      }

      const response = await fetch(`${API_URL}/${meeting.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const result: { message?: string } =
        await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          result.message || 'Could not delete the meeting.',
        )
      }

      setMeetings((current) =>
        current.filter((item) => item.id !== meeting.id),
      )

      showSuccess(`"${meeting.title}" was deleted successfully.`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not connect to the backend to delete the meeting.',
      )
    } finally {
      setDeletingMeetingId(null)
    }
  }

  // Open a meeting room from a code, URL, or meeting card.
  function joinMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    dismissMessages()

    const roomId = getMeetingIdFromInput(meetingCode)

    if (!roomId) {
      setErrorMessage(
        'Please enter a valid meeting code or meeting link.',
      )
      return
    }

    setMeetingCode('')
    setShowJoinForm(false)
    setActiveMeetingRoom(roomId)
  }

  function joinScheduledMeeting(meeting: Meeting) {
    dismissMessages()
    setShowMeetingForm(false)
    setShowJoinForm(false)
    setActiveMeetingRoom(meeting.id)
  }

  // Copy a shareable link to the clipboard.
  async function shareMeeting(meeting: Meeting) {
    dismissMessages()

    const link = `${window.location.origin}/?meeting=${encodeURIComponent(
      meeting.id,
    )}`

    try {
      await navigator.clipboard.writeText(link)
      showSuccess(`Meeting link for "${meeting.title}" copied.`)
    } catch {
      // Fallback for browsers where clipboard access is unavailable.
      window.prompt('Copy this meeting link:', link)
    }
  }

  function formatDate(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString(
      undefined,
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
    )
  }

  // Display the actual video meeting room instead of the dashboard.
  if (activeMeetingRoom) {
    return (
      <MeetingRoom
        roomId={activeMeetingRoom}
        displayName={user?.name || 'IntellMeet User'}
        onLeave={() => {
          setActiveMeetingRoom(null)
          const url = new URL(window.location.href)
          url.searchParams.delete('meeting')
          window.history.replaceState({}, '', url)
        }}
      />
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="brand">✦ IntellMeet</h2>
        <p className="nav-label">WORKSPACE</p>

        <nav>
          {menuItems.map((item) => {
            const icons: Record<string, string> = {
              Dashboard: '▦',
              Meetings: '◷',
              Messages: '☏',
              'My Tasks': '✓',
              Projects: '▣',
              Team: '♧',
              Analytics: '▥',
              Profile: '◎',
            }

            return (
              <button
                key={item}
                type="button"
                className={`nav-item ${
                  activePage === item ? 'active' : ''
                }`}
                onClick={() => {
                  setActivePage(item)
                  dismissMessages()
                }}
              >
                <span className="nav-icon">{icons[item]}</span>
                <span>{item}</span>
              </button>
            )
          })}
        </nav>

        <div className="profile">
          <div className="avatar">
            {(user?.name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{user?.name || 'Your Account'}</strong>
            <p>{user?.email || 'Workspace member'}</p>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">WORKSPACE / OVERVIEW</p>
            <h1>{activePage}</h1>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() =>
                setTheme((current) =>
                  current === 'light' ? 'dark' : 'light',
                )
              }
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              <span aria-hidden="true">
                {theme === 'light' ? '☾' : '☀'}
              </span>
              <span>
                {theme === 'light' ? 'Dark' : 'Light'} Mode
              </span>
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={openJoinMeeting}
            >
              Join Meeting
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={openCreateMeeting}
            >
              + New Meeting
            </button>
          </div>
        </header>

        {notice && (
          <div
            key={notice.id}
            className="notice success-notice"
            role="status"
          >
            <span>✓ {notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {errorMessage && !showMeetingForm && !showJoinForm && (
          <div className="notice error-notice" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage('')}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {activePage === 'Dashboard' && (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">YOUR COLLABORATION HUB</p>
                <h2>Good to see you!</h2>
                <p>
                  Bring your team together. Make every meeting more
                  productive.
                </p>
              </div>
              <div className="welcome-icon">✦</div>
            </section>

            <section className="stats">
              <article className="stat-card">
                <span>Upcoming Meetings</span>
                <h2>{upcomingMeetings.length}</h2>
                <p>Your scheduled conversations</p>
              </article>

              <article className="stat-card">
                <span>Pending Tasks</span>
                <h2>
                  {dashboardAnalytics
                    ? dashboardAnalytics.todoTaskCount +
                      dashboardAnalytics.inProgressTaskCount
                    : '—'}
                </h2>
                <p>Stay on top of your work</p>
              </article>

              <article className="stat-card">
                <span>Active Projects</span>
                <h2>{dashboardAnalytics?.activeProjectCount ?? '—'}</h2>
                <p>Your team's projects</p>
              </article>

              <article className="stat-card">
                <span>AI Meeting Notes</span>
                <h2>{dashboardAnalytics?.summaryCount ?? '—'}</h2>
                <p>Meeting insights in one place</p>
              </article>
            </section>

            <LiveTranscript />

            <section className="content-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Upcoming Meetings</h3>
                    <p>Your next team conversations</p>
                  </div>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setActivePage('Meetings')}
                  >
                    View all
                  </button>
                </div>

                {loadingMeetings ? (
                  <div className="empty-state">
                    <p>Loading meetings...</p>
                  </div>
                ) : upcomingMeetings.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">◷</div>
                    <h3>No meetings yet</h3>
                    <p>Create a meeting to get your team started.</p>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={openCreateMeeting}
                    >
                      Create a meeting
                    </button>
                  </div>
                ) : (
                  <div className="meeting-list">
                    {upcomingMeetings.slice(0, 3).map((meeting) => (
                      <MeetingCard
                        key={meeting.id}
                        meeting={meeting}
                        formatDate={formatDate}
                        onJoin={joinScheduledMeeting}
                        onShare={shareMeeting}
                        onDelete={deleteMeeting}
                        isDeleting={deletingMeetingId === meeting.id}
                      />
                    ))}
                  </div>
                )}
              </article>

              <article className="panel">
                <h3>Quick Actions</h3>
                <p className="panel-description">
                  Get things done without losing focus.
                </p>

                <button
                  type="button"
                  className="action-button"
                  onClick={openCreateMeeting}
                >
                  <span className="action-icon">◷</span>
                  <span>
                    <strong>Schedule a meeting</strong>
                    <small>Bring everyone together</small>
                  </span>
                  <span>→</span>
                </button>

                <button
                  type="button"
                  className="action-button"
                  onClick={() => setActivePage('My Tasks')}
                >
                  <span className="action-icon">✓</span>
                  <span>
                    <strong>Create a task</strong>
                    <small>Keep work moving forward</small>
                  </span>
                  <span>→</span>
                </button>

                <button
                  type="button"
                  className="action-button"
                  onClick={() => setActivePage('Projects')}
                >
                  <span className="action-icon">▣</span>
                  <span>
                    <strong>Explore projects</strong>
                    <small>Organize your team's work</small>
                  </span>
                  <span>→</span>
                </button>
              </article>
            </section>
          </>
        )}

        {activePage === 'Meetings' && (
          <section className="panel page-panel">
            <div className="panel-heading">
              <div>
                <h3>All Meetings</h3>
                <p>Manage your scheduled conversations.</p>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={openCreateMeeting}
              >
                + Schedule
              </button>
            </div>

            {loadingMeetings ? (
              <div className="empty-state">
                <p>Loading meetings...</p>
              </div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">◷</div>
                <h3>No upcoming meetings</h3>
                <p>Your meetings will appear here after you create them.</p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openCreateMeeting}
                >
                  Schedule your first meeting
                </button>
              </div>
            ) : (
              <div className="meeting-list">
                {upcomingMeetings.map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    formatDate={formatDate}
                    onJoin={joinScheduledMeeting}
                    onShare={shareMeeting}
                    onDelete={deleteMeeting}
                    isDeleting={deletingMeetingId === meeting.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {(
          [
            'Messages',
            'My Tasks',
            'Projects',
            'Team',
            'Analytics',
          ] as WorkspaceSection[]
        ).includes(activePage as WorkspaceSection) &&
          token && (
            <WorkspacePage
              page={activePage as WorkspaceSection}
              token={token}
            />
        )}

        {activePage === 'Profile' && <ProfilePage />}
      </main>

      {showMeetingForm && (
        <div className="modal-overlay" onClick={closeCreateMeeting}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">INTELLMEET</p>
                <h2 id="meeting-modal-title">Schedule a Meeting</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={closeCreateMeeting}
                aria-label="Close popup"
              >
                ×
              </button>
            </div>

            {errorMessage && (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            )}

            <form onSubmit={createMeeting}>
              <label htmlFor="meeting-title">Meeting title</label>
              <input
                id="meeting-title"
                type="text"
                placeholder="e.g. Weekly team sync"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
                maxLength={100}
                required
              />

              <div className="form-row">
                <div>
                  <label htmlFor="meeting-date">Date</label>
                  <input
                    id="meeting-date"
                    type="date"
                    min={getToday()}
                    value={meetingDate}
                    onChange={(event) => setMeetingDate(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="meeting-time">Time</label>
                  <input
                    id="meeting-time"
                    type="time"
                    value={meetingTime}
                    onChange={(event) => setMeetingTime(event.target.value)}
                    required
                  />
                </div>
              </div>

              <p className="form-note">
                Your meeting will be saved and appear in Upcoming Meetings.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeCreateMeeting}
                  disabled={savingMeeting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={savingMeeting}
                >
                  {savingMeeting ? 'Creating...' : 'Create Meeting'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showJoinForm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowJoinForm(false)
            setErrorMessage('')
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">INTELLMEET</p>
                <h2 id="join-modal-title">Join a Meeting</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => {
                  setShowJoinForm(false)
                  setErrorMessage('')
                }}
                aria-label="Close popup"
              >
                ×
              </button>
            </div>

            {errorMessage && (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            )}

            <form onSubmit={joinMeeting}>
              <label htmlFor="meeting-code">Meeting code or link</label>
              <input
                id="meeting-code"
                type="text"
                placeholder="Paste a meeting code or link"
                value={meetingCode}
                onChange={(event) => setMeetingCode(event.target.value)}
                required
              />

              <p className="form-note">
                Allow camera and microphone access when your browser asks.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => {
                    setShowJoinForm(false)
                    setErrorMessage('')
                  }}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button">
                  Join Meeting
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function MeetingCard({
  meeting,
  formatDate,
  onJoin,
  onShare,
  onDelete,
  isDeleting,
}: {
  meeting: Meeting
  formatDate: (date: string) => string
  onJoin: (meeting: Meeting) => void
  onShare: (meeting: Meeting) => void
  onDelete: (meeting: Meeting) => void
  isDeleting: boolean
}) {
  return (
    <article className="meeting-card">
      <div className="meeting-card-icon">◷</div>

      <div className="meeting-details">
        <strong>{meeting.title}</strong>
        <p>
          {formatDate(meeting.date)} · {meeting.time}
        </p>
      </div>

      <span className="meeting-status">Scheduled</span>

      <div className="meeting-card-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => onJoin(meeting)}
        >
          Join
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => onShare(meeting)}
        >
          Copy link
        </button>

        <button
          type="button"
          className="delete-meeting-button"
          onClick={() => onDelete(meeting)}
          disabled={isDeleting}
          aria-label={`Delete meeting ${meeting.title}`}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </article>
  )
}

export default App
