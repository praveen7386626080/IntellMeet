import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import './WorkspacePage.css'

export type WorkspaceSection =
  | 'Messages'
  | 'My Tasks'
  | 'Projects'
  | 'Team'
  | 'Analytics'

interface WorkspacePageProps {
  page: WorkspaceSection
  token: string
}

interface Project {
  _id: string
  title: string
  description: string
  status: 'planning' | 'active' | 'completed'
}

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
  dueDate: string
  projectId: string | null
}

interface TeamMember {
  id: string
  name: string
  email: string
  isOwner: boolean
}

interface WorkspaceTeam {
  id: string
  name: string
  isOwner: boolean
  owner: TeamMember | null
  members: TeamMember[]
}

interface WorkspaceMessage {
  id: string
  teamId: string
  teamName: string
  senderId: string
  senderName: string
  text: string
  createdAt: string
}

interface Analytics {
  meetingCount: number
  projectCount: number
  activeProjectCount: number
  taskCount: number
  todoTaskCount: number
  inProgressTaskCount: number
  completedTaskCount: number
  messageCount: number
  teamMemberCount: number
  summaryCount: number
}

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/workspace`

const pageDescriptions: Record<WorkspaceSection, string> = {
  Messages: 'Keep your workspace conversations in one shared place.',
  'My Tasks': 'Organize your work and track progress across projects.',
  Projects: 'Plan, track, and complete the work that matters.',
  Team: 'Manage your workspace members and collaborate together.',
  Analytics: 'See a live overview of your meetings and workspace activity.',
}

const taskStatusLabels: Record<Task['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Completed',
}

const projectStatusLabels: Record<Project['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
}

async function apiRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  })
  let body: unknown

  try {
    body = await response.json()
  } catch {
    body = {}
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'The request could not be completed.'
    throw new Error(message)
  }

  return body as T
}

export default function WorkspacePage({
  page,
  token,
}: WorkspacePageProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [teams, setTeams] = useState<WorkspaceTeam[]>([])
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadPage = useCallback(
    async (showLoading: boolean, isCurrent: () => boolean) => {
      if (showLoading && isCurrent()) {
        setLoading(true)
        setError('')
      }

      try {
        if (page === 'Projects') {
          const data = await apiRequest<Project[]>('/projects', token)
          if (isCurrent()) setProjects(data)
        } else if (page === 'My Tasks') {
          const [taskData, projectData] = await Promise.all([
            apiRequest<Task[]>('/tasks', token),
            apiRequest<Project[]>('/projects', token),
          ])
          if (isCurrent()) {
            setTasks(taskData)
            setProjects(projectData)
          }
        } else if (page === 'Team' || page === 'Messages') {
          const teamData = await apiRequest<WorkspaceTeam[]>('/team', token)
          if (isCurrent()) setTeams(teamData)

          if (page === 'Messages') {
            const messageData = await apiRequest<WorkspaceMessage[]>(
              '/messages',
              token,
            )
            if (isCurrent()) setMessages(messageData)
          }
        } else {
          const data = await apiRequest<Analytics>('/analytics', token)
          if (isCurrent()) setAnalytics(data)
        }
      } catch (loadError) {
        if (isCurrent()) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load this workspace section.',
          )
        }
      } finally {
        if (showLoading && isCurrent()) setLoading(false)
      }
    },
    [page, token],
  )

  useEffect(() => {
    let current = true
    const isCurrent = () => current
    const initialLoad = window.setTimeout(() => {
      void loadPage(true, isCurrent)
    }, 0)

    const poll =
      page === 'Messages'
        ? window.setInterval(() => {
            void loadPage(false, isCurrent)
          }, 6000)
        : undefined

    return () => {
      current = false
      window.clearTimeout(initialLoad)
      if (poll !== undefined) window.clearInterval(poll)
    }
  }, [loadPage, page])

  function showSuccess(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setError('')
    setNotice('')

    try {
      await action()
      showSuccess(success)
      await loadPage(false, () => true)
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'The action could not be completed.',
      )
    }
  }

  return (
    <section className="workspace-page">
      <header className="workspace-page-heading">
        <div>
          <p className="workspace-page-kicker">WORKSPACE</p>
          <h2>{page}</h2>
          <p>{pageDescriptions[page]}</p>
        </div>
        <span className="workspace-page-mark" aria-hidden="true">
          {page === 'Messages'
            ? '✉'
            : page === 'My Tasks'
              ? '✓'
              : page === 'Projects'
                ? '▣'
                : page === 'Team'
                  ? '♧'
                  : '▥'}
        </span>
      </header>

      {error && (
        <p className="workspace-feedback workspace-feedback-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="workspace-feedback workspace-feedback-success" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="workspace-loading" role="status">
          Loading {page.toLowerCase()}…
        </div>
      ) : (
        <>
          {page === 'Projects' && (
            <ProjectsSection
              projects={projects}
              token={token}
              onAction={runAction}
            />
          )}
          {page === 'My Tasks' && (
            <TasksSection
              tasks={tasks}
              projects={projects}
              token={token}
              onAction={runAction}
            />
          )}
          {page === 'Team' && (
            <TeamSection teams={teams} token={token} onAction={runAction} />
          )}
          {page === 'Messages' && (
            <MessagesSection
              teams={teams}
              messages={messages}
              token={token}
              onAction={runAction}
            />
          )}
          {page === 'Analytics' && analytics && (
            <AnalyticsSection analytics={analytics} />
          )}
        </>
      )}
    </section>
  )
}

function ProjectsSection({
  projects,
  token,
  onAction,
}: {
  projects: Project[]
  token: string
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onAction(
      async () => {
        await apiRequest<Project>('/projects', token, {
          method: 'POST',
          body: JSON.stringify({ title, description }),
        })
        setTitle('')
        setDescription('')
      },
      'Project created.',
    )
  }

  return (
    <div className="workspace-columns">
      <form
        className="workspace-card workspace-form"
        onSubmit={(event) => void createProject(event)}
      >
        <div className="workspace-card-heading">
          <div>
            <h3>Create a project</h3>
            <p>Give a goal a name and a place to grow.</p>
          </div>
          <span className="workspace-card-icon">＋</span>
        </div>
        <label htmlFor="project-title">Project name</label>
        <input
          id="project-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Product launch"
          maxLength={100}
          required
        />
        <label htmlFor="project-description">Description</label>
        <textarea
          id="project-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What are you working toward?"
          maxLength={1000}
          rows={4}
        />
        <button className="workspace-primary-button" type="submit">
          Create project
        </button>
      </form>

      <div className="workspace-card">
        <div className="workspace-card-heading">
          <div>
            <h3>Your projects</h3>
            <p>{projects.length} projects in your workspace</p>
          </div>
        </div>
        {projects.length === 0 ? (
          <EmptyWorkspace
            icon="▣"
            title="Your next big idea starts here"
            description="Create a project to group tasks and track progress."
          />
        ) : (
          <div className="workspace-record-list">
            {projects.map((project) => (
              <article className="workspace-record" key={project._id}>
                <div className="workspace-record-main">
                  <span className="workspace-record-icon">▣</span>
                  <div>
                    <h4>{project.title}</h4>
                    <p>{project.description || 'No description added yet.'}</p>
                  </div>
                </div>
                <div className="workspace-record-actions">
                  <select
                    aria-label={`Status for ${project.title}`}
                    value={project.status}
                    onChange={(event) => {
                      const status = event.target.value as Project['status']
                      void onAction(
                        async () => {
                          await apiRequest<Project>(
                            `/projects/${project._id}`,
                            token,
                            {
                              method: 'PATCH',
                              body: JSON.stringify({ status }),
                            },
                          )
                        },
                        'Project status updated.',
                      )
                    }}
                  >
                    {Object.entries(projectStatusLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="workspace-danger-button"
                    onClick={() => {
                      if (!window.confirm(`Delete "${project.title}"?`)) return
                      void onAction(async () => {
                        await apiRequest<{ message: string }>(
                          `/projects/${project._id}`,
                          token,
                          { method: 'DELETE' },
                        )
                      }, 'Project deleted.')
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TasksSection({
  tasks,
  projects,
  token,
  onAction,
}: {
  tasks: Task[]
  projects: Project[]
  token: string
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [projectId, setProjectId] = useState('')

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onAction(async () => {
      await apiRequest<Task>('/tasks', token, {
        method: 'POST',
        body: JSON.stringify({ title, description, dueDate, projectId }),
      })
      setTitle('')
      setDescription('')
      setDueDate('')
      setProjectId('')
    }, 'Task created.')
  }

  return (
    <>
      <form className="workspace-card workspace-task-form" onSubmit={createTask}>
        <div className="workspace-card-heading">
          <div>
            <h3>Add a task</h3>
            <p>Keep your next steps clear and actionable.</p>
          </div>
          <span className="workspace-card-icon">✓</span>
        </div>
        <div className="workspace-field">
          <label htmlFor="task-title">Task</label>
          <input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to get done?"
            maxLength={160}
            required
          />
        </div>
        <div className="workspace-field">
          <label htmlFor="task-description">Details</label>
          <textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a little context (optional)"
            maxLength={1000}
            rows={2}
          />
        </div>
        <div className="workspace-form-row">
          <div>
            <label htmlFor="task-due-date">Due date</label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="task-project">Project</label>
            <select
              id="task-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option value={project._id} key={project._id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="workspace-primary-button" type="submit">
          Add task
        </button>
      </form>

      <div className="workspace-card workspace-task-list-card">
        <div className="workspace-card-heading">
          <div>
            <h3>Your tasks</h3>
            <p>{tasks.filter((task) => task.status !== 'done').length} open tasks</p>
          </div>
          <span className="workspace-count-pill">{tasks.length}</span>
        </div>
        {tasks.length === 0 ? (
          <EmptyWorkspace
            icon="✓"
            title="A clear list is a great start"
            description="Add a task above to begin organizing your work."
          />
        ) : (
          <div className="workspace-record-list">
            {tasks.map((task) => (
              <article
                className={`workspace-task-record ${task.status === 'done' ? 'is-complete' : ''}`}
                key={task._id}
              >
                <span className="workspace-task-check" aria-hidden="true">
                  {task.status === 'done' ? '✓' : '·'}
                </span>
                <div className="workspace-task-copy">
                  <h4>{task.title}</h4>
                  {task.description && <p>{task.description}</p>}
                  <span>
                    {task.projectId
                      ? projects.find((project) => project._id === task.projectId)?.title ??
                        'Project'
                      : 'Personal task'}
                    {task.dueDate
                      ? ` · Due ${new Date(`${task.dueDate}T00:00:00`).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
                <div className="workspace-record-actions">
                  <select
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    onChange={(event) => {
                      const status = event.target.value as Task['status']
                      void onAction(async () => {
                        await apiRequest<Task>(`/tasks/${task._id}`, token, {
                          method: 'PATCH',
                          body: JSON.stringify({ status }),
                        })
                      }, 'Task status updated.')
                    }}
                  >
                    {Object.entries(taskStatusLabels).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="workspace-danger-button"
                    onClick={() => {
                      void onAction(async () => {
                        await apiRequest<{ message: string }>(
                          `/tasks/${task._id}`,
                          token,
                          { method: 'DELETE' },
                        )
                      }, 'Task deleted.')
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function TeamSection({
  teams,
  token,
  onAction,
}: {
  teams: WorkspaceTeam[]
  token: string
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
}) {
  const [emailByTeam, setEmailByTeam] = useState<Record<string, string>>({})

  async function addMember(
    event: FormEvent<HTMLFormElement>,
    teamId: string,
  ) {
    event.preventDefault()
    const email = emailByTeam[teamId]?.trim()
    if (!email) return

    await onAction(async () => {
      await apiRequest<TeamMember>(`/team/${teamId}/members`, token, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setEmailByTeam((current) => ({ ...current, [teamId]: '' }))
    }, 'Team member added.')
  }

  return (
    <div className="workspace-team-grid">
      {teams.map((team) => (
        <article className="workspace-card workspace-team-card" key={team.id}>
          <div className="workspace-card-heading">
            <div>
              <h3>{team.name}</h3>
              <p>
                {team.isOwner
                  ? 'Your workspace'
                  : `Owned by ${team.owner?.name ?? 'a teammate'}`}
              </p>
            </div>
            <span className="workspace-card-icon">♧</span>
          </div>

          <div className="workspace-member-list">
            {team.members.map((member) => (
              <div className="workspace-member" key={member.id}>
                <span className="workspace-member-avatar">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="workspace-member-copy">
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </span>
                {member.isOwner ? (
                  <span className="workspace-owner-badge">Owner</span>
                ) : team.isOwner ? (
                  <button
                    type="button"
                    className="workspace-danger-button"
                    aria-label={`Remove ${member.name} from ${team.name}`}
                    onClick={() => {
                      void onAction(async () => {
                        await apiRequest<{ message: string }>(
                          `/team/${team.id}/members/${member.id}`,
                          token,
                          { method: 'DELETE' },
                        )
                      }, 'Team member removed.')
                    }}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="workspace-owner-badge">Member</span>
                )}
              </div>
            ))}
          </div>

          {team.isOwner && (
            <form
              className="workspace-invite-form"
              onSubmit={(event) => void addMember(event, team.id)}
            >
              <label htmlFor={`invite-${team.id}`}>Invite an account</label>
              <div>
                <input
                  id={`invite-${team.id}`}
                  type="email"
                  value={emailByTeam[team.id] ?? ''}
                  onChange={(event) =>
                    setEmailByTeam((current) => ({
                      ...current,
                      [team.id]: event.target.value,
                    }))
                  }
                  placeholder="teammate@example.com"
                  required
                />
                <button className="workspace-primary-button" type="submit">
                  Add member
                </button>
              </div>
              <small>They need an existing IntellMeet account.</small>
            </form>
          )}
        </article>
      ))}
      {teams.length === 0 && (
        <div className="workspace-card">
          <EmptyWorkspace
            icon="♧"
            title="Your workspace is being prepared"
            description="Refresh this section to load your team."
          />
        </div>
      )}
    </div>
  )
}

function MessagesSection({
  teams,
  messages,
  token,
  onAction,
}: {
  teams: WorkspaceTeam[]
  messages: WorkspaceMessage[]
  token: string
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
}) {
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [text, setText] = useState('')

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanText = text.trim()
    const teamId = activeTeam?.id
    if (!cleanText || !teamId) return

    await onAction(async () => {
      await apiRequest<WorkspaceMessage>('/messages', token, {
        method: 'POST',
        body: JSON.stringify({ teamId, text: cleanText }),
      })
      setText('')
    }, 'Message sent.')
  }

  const activeTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0]
  const visibleMessages = messages.filter(
    (message) => message.teamId === activeTeam?.id,
  )

  return (
    <section className="workspace-card workspace-messages-card">
      <div className="workspace-card-heading">
        <div>
          <h3>Team conversation</h3>
          <p>Messages are saved and shared with workspace members.</p>
        </div>
        {teams.length > 1 && (
          <select
            aria-label="Choose a workspace conversation"
            value={activeTeam?.id ?? ''}
            onChange={(event) => setSelectedTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option value={team.id} key={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {teams.length === 0 ? (
        <EmptyWorkspace
          icon="✉"
          title="No workspace conversations yet"
          description="Join a team or create your workspace to start chatting."
        />
      ) : (
        <>
          <div className="workspace-message-list" aria-live="polite">
            {visibleMessages.length === 0 ? (
              <EmptyWorkspace
                icon="✉"
                title="Start the conversation"
                description={`Be the first to send a message in ${activeTeam?.name ?? 'your workspace'}.`}
              />
            ) : (
              visibleMessages.map((message) => (
                <article className="workspace-message" key={message.id}>
                  <span className="workspace-member-avatar">
                    {message.senderName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="workspace-message-body">
                    <div>
                      <strong>{message.senderName}</strong>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </div>
                    <p>{message.text}</p>
                  </div>
                </article>
              ))
            )}
          </div>
          <form className="workspace-message-form" onSubmit={sendMessage}>
            <label className="visually-hidden" htmlFor="workspace-message-input">
              Write a message
            </label>
            <input
              id="workspace-message-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={`Message ${activeTeam?.name ?? 'your team'}…`}
              maxLength={2000}
              autoComplete="off"
              required
            />
            <button
              className="workspace-primary-button"
              type="submit"
              disabled={!text.trim()}
            >
              Send
            </button>
          </form>
        </>
      )}
    </section>
  )
}

function AnalyticsSection({ analytics }: { analytics: Analytics }) {
  const taskTotal = Math.max(analytics.taskCount, 1)

  return (
    <>
      <div className="workspace-analytics-grid">
        <AnalyticsCard label="Meetings scheduled" value={analytics.meetingCount} icon="◷" />
        <AnalyticsCard label="Projects" value={analytics.projectCount} icon="▣" />
        <AnalyticsCard label="Active projects" value={analytics.activeProjectCount} icon="↗" />
        <AnalyticsCard label="Team members" value={analytics.teamMemberCount} icon="♧" />
      </div>

      <section className="workspace-card workspace-progress-card">
        <div className="workspace-card-heading">
          <div>
            <h3>Task progress</h3>
            <p>{analytics.completedTaskCount} of {analytics.taskCount} tasks completed</p>
          </div>
          <span className="workspace-count-pill">{analytics.taskCount} total</span>
        </div>
        <div className="workspace-progress-track" aria-label="Task completion">
          <span
            className="workspace-progress-fill"
            style={{
              width: `${Math.round((analytics.completedTaskCount / taskTotal) * 100)}%`,
            }}
          />
        </div>
        <div className="workspace-progress-legend">
          <span><i className="legend-todo" /> To do <strong>{analytics.todoTaskCount}</strong></span>
          <span><i className="legend-progress" /> In progress <strong>{analytics.inProgressTaskCount}</strong></span>
          <span><i className="legend-complete" /> Completed <strong>{analytics.completedTaskCount}</strong></span>
        </div>
      </section>

      <div className="workspace-analytics-note">
        <span aria-hidden="true">✦</span>
        <p>
          Your team has shared <strong>{analytics.messageCount}</strong> workspace
          messages and saved <strong>{analytics.summaryCount}</strong> AI meeting
          notes. Analytics update as you work.
        </p>
      </div>
    </>
  )
}

function AnalyticsCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: string
}) {
  return (
    <article className="workspace-analytics-card">
      <span className="workspace-analytics-icon">{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function EmptyWorkspace({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="workspace-empty">
      <span aria-hidden="true">{icon}</span>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  )
}
