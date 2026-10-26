import { Router, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import Meeting from '../Models/Meeting'
import Project from '../Models/Project'
import Task from '../Models/Task'
import User from '../Models/User'
import WorkspaceMessage from '../Models/WorkspaceMessage'
import WorkspaceTeam from '../Models/WorkspaceTeam'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth'

const router = Router()

router.use(requireAuth)

const projectStatuses = ['planning', 'active', 'completed'] as const
const taskStatuses = ['todo', 'in_progress', 'done'] as const

function getParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function isValidId(value: string): boolean {
  return mongoose.isValidObjectId(value)
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

async function getOrCreateOwnedTeam(ownerId: string) {
  return WorkspaceTeam.findOneAndUpdate(
    { ownerId },
    { $setOnInsert: { ownerId, name: 'My Workspace' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
}

async function getAccessibleTeams(userId: string) {
  await getOrCreateOwnedTeam(userId)
  return WorkspaceTeam.find({
    $or: [{ ownerId: userId }, { members: userId }],
  }).sort({ createdAt: 1 })
}

router.get('/projects', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const projects = await Project.find({ ownerId: req.userId })
      .sort({ updatedAt: -1 })
      .lean()
    res.status(200).json(projects)
  } catch (error) {
    console.error('Could not fetch workspace projects:', error)
    res.status(500).json({ message: 'Could not fetch projects.' })
  }
})

router.post('/projects', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const { title, description } = req.body as {
    title?: unknown
    description?: unknown
  }

  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 100 ||
    (description !== undefined &&
      (typeof description !== 'string' || description.length > 1000))
  ) {
    res.status(400).json({
      message: 'Provide a project title (up to 100 characters) and a valid description.',
    })
    return
  }

  try {
    const project = await Project.create({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      ownerId: req.userId,
    })
    res.status(201).json(project)
  } catch (error) {
    console.error('Could not create workspace project:', error)
    res.status(500).json({ message: 'Could not create the project.' })
  }
})

router.patch(
  '/projects/:projectId',
  async (req: AuthenticatedRequest, res: Response) => {
    const projectId = getParam(req.params.projectId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!projectId || !isValidId(projectId)) {
      res.status(400).json({ message: 'Invalid project ID.' })
      return
    }

    const { status } = req.body as { status?: unknown }

    if (
      typeof status !== 'string' ||
      !projectStatuses.includes(status as (typeof projectStatuses)[number])
    ) {
      res.status(400).json({ message: 'Choose a valid project status.' })
      return
    }

    try {
      const project = await Project.findOneAndUpdate(
        { _id: projectId, ownerId: req.userId },
        { $set: { status } },
        { new: true, runValidators: true },
      )

      if (!project) {
        res.status(404).json({ message: 'Project not found.' })
        return
      }

      res.status(200).json(project)
    } catch (error) {
      console.error('Could not update workspace project:', error)
      res.status(500).json({ message: 'Could not update the project.' })
    }
  },
)

router.delete(
  '/projects/:projectId',
  async (req: AuthenticatedRequest, res: Response) => {
    const projectId = getParam(req.params.projectId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!projectId || !isValidId(projectId)) {
      res.status(400).json({ message: 'Invalid project ID.' })
      return
    }

    try {
      const project = await Project.findOneAndDelete({
        _id: projectId,
        ownerId: req.userId,
      })

      if (!project) {
        res.status(404).json({ message: 'Project not found.' })
        return
      }

      await Task.updateMany(
        { projectId, ownerId: req.userId },
        { $set: { projectId: null } },
      )
      res.status(200).json({ message: 'Project deleted.' })
    } catch (error) {
      console.error('Could not delete workspace project:', error)
      res.status(500).json({ message: 'Could not delete the project.' })
    }
  },
)

router.get('/tasks', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const tasks = await Task.find({ ownerId: req.userId })
      .sort({ dueDate: 1, createdAt: -1 })
      .lean()
    res.status(200).json(tasks)
  } catch (error) {
    console.error('Could not fetch workspace tasks:', error)
    res.status(500).json({ message: 'Could not fetch tasks.' })
  }
})

router.post('/tasks', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const { title, description, dueDate, projectId } = req.body as {
    title?: unknown
    description?: unknown
    dueDate?: unknown
    projectId?: unknown
  }

  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 160 ||
    (description !== undefined &&
      (typeof description !== 'string' || description.length > 1000)) ||
    (dueDate !== undefined &&
      dueDate !== '' &&
      (typeof dueDate !== 'string' ||
        !isValidDate(dueDate))) ||
    (projectId !== undefined &&
      projectId !== '' &&
      (typeof projectId !== 'string' || !isValidId(projectId)))
  ) {
    res.status(400).json({ message: 'Provide valid task details.' })
    return
  }

  try {
    if (typeof projectId === 'string' && projectId) {
      const project = await Project.findOne({
        _id: projectId,
        ownerId: req.userId,
      })

      if (!project) {
        res.status(400).json({ message: 'Choose one of your own projects.' })
        return
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      dueDate: typeof dueDate === 'string' ? dueDate : '',
      projectId: typeof projectId === 'string' && projectId ? projectId : null,
      ownerId: req.userId,
    })
    res.status(201).json(task)
  } catch (error) {
    console.error('Could not create workspace task:', error)
    res.status(500).json({ message: 'Could not create the task.' })
  }
})

router.patch(
  '/tasks/:taskId',
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = getParam(req.params.taskId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!taskId || !isValidId(taskId)) {
      res.status(400).json({ message: 'Invalid task ID.' })
      return
    }

    const { status } = req.body as { status?: unknown }

    if (
      typeof status !== 'string' ||
      !taskStatuses.includes(status as (typeof taskStatuses)[number])
    ) {
      res.status(400).json({ message: 'Choose a valid task status.' })
      return
    }

    try {
      const task = await Task.findOneAndUpdate(
        { _id: taskId, ownerId: req.userId },
        { $set: { status } },
        { new: true, runValidators: true },
      )

      if (!task) {
        res.status(404).json({ message: 'Task not found.' })
        return
      }

      res.status(200).json(task)
    } catch (error) {
      console.error('Could not update workspace task:', error)
      res.status(500).json({ message: 'Could not update the task.' })
    }
  },
)

router.delete(
  '/tasks/:taskId',
  async (req: AuthenticatedRequest, res: Response) => {
    const taskId = getParam(req.params.taskId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!taskId || !isValidId(taskId)) {
      res.status(400).json({ message: 'Invalid task ID.' })
      return
    }

    try {
      const task = await Task.findOneAndDelete({
        _id: taskId,
        ownerId: req.userId,
      })

      if (!task) {
        res.status(404).json({ message: 'Task not found.' })
        return
      }

      res.status(200).json({ message: 'Task deleted.' })
    } catch (error) {
      console.error('Could not delete workspace task:', error)
      res.status(500).json({ message: 'Could not delete the task.' })
    }
  },
)

router.get('/team', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const teams = await getAccessibleTeams(req.userId)
    const userIds = new Set<string>()

    for (const team of teams) {
      userIds.add(String(team.ownerId))
      team.members.forEach((memberId) => userIds.add(String(memberId)))
    }

    const users = await User.find({
      _id: { $in: Array.from(userIds) },
    })
      .select('name email')
      .lean()
    const usersById = new Map(users.map((user) => [String(user._id), user]))

    res.status(200).json(
      teams.map((team) => {
        const owner = usersById.get(String(team.ownerId))
        const memberIds = [
          String(team.ownerId),
          ...team.members.map((memberId) => String(memberId)),
        ]

        return {
          id: String(team._id),
          name: team.name,
          isOwner: String(team.ownerId) === req.userId,
          owner: owner
            ? {
                id: String(owner._id),
                name: owner.name,
                email: owner.email,
              }
            : null,
          members: memberIds.flatMap((memberId) => {
            const member = usersById.get(memberId)
            return member
              ? [
                  {
                    id: String(member._id),
                    name: member.name,
                    email: member.email,
                    isOwner: memberId === String(team.ownerId),
                  },
                ]
              : []
          }),
        }
      }),
    )
  } catch (error) {
    console.error('Could not fetch workspace teams:', error)
    res.status(500).json({ message: 'Could not fetch your team.' })
  }
})

router.post(
  '/team/:teamId/members',
  async (req: AuthenticatedRequest, res: Response) => {
    const teamId = getParam(req.params.teamId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!teamId || !isValidId(teamId)) {
      res.status(400).json({ message: 'Invalid team ID.' })
      return
    }

    const { email } = req.body as { email?: unknown }

    if (
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({ message: 'Enter a valid account email address.' })
      return
    }

    try {
      const team = await WorkspaceTeam.findOne({
        _id: teamId,
        ownerId: req.userId,
      })

      if (!team) {
        res.status(403).json({ message: 'Only the workspace owner can add members.' })
        return
      }

      const member = await User.findOne({
        email: email.trim().toLowerCase(),
      }).select('name email')

      if (!member) {
        res.status(404).json({
          message: 'No IntellMeet account exists for that email yet.',
        })
        return
      }

      if (String(member._id) === req.userId) {
        res.status(400).json({ message: 'You are already the workspace owner.' })
        return
      }

      if (team.members.some((memberId) => String(memberId) === String(member._id))) {
        res.status(409).json({ message: 'This person is already on your team.' })
        return
      }

      team.members.push(member._id)
      await team.save()
      res.status(201).json({
        id: String(member._id),
        name: member.name,
        email: member.email,
        isOwner: false,
      })
    } catch (error) {
      console.error('Could not add workspace team member:', error)
      res.status(500).json({ message: 'Could not add this team member.' })
    }
  },
)

router.delete(
  '/team/:teamId/members/:memberId',
  async (req: AuthenticatedRequest, res: Response) => {
    const teamId = getParam(req.params.teamId)
    const memberId = getParam(req.params.memberId)

    if (!req.userId) {
      res.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (!teamId || !memberId || !isValidId(teamId) || !isValidId(memberId)) {
      res.status(400).json({ message: 'Invalid team or member ID.' })
      return
    }

    try {
      const team = await WorkspaceTeam.findOneAndUpdate(
        { _id: teamId, ownerId: req.userId, members: memberId },
        { $pull: { members: memberId } },
        { new: true },
      )

      if (!team) {
        res.status(404).json({ message: 'Team member not found.' })
        return
      }

      res.status(200).json({ message: 'Team member removed.' })
    } catch (error) {
      console.error('Could not remove workspace team member:', error)
      res.status(500).json({ message: 'Could not remove this team member.' })
    }
  },
)

router.get('/messages', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const teams = await getAccessibleTeams(req.userId)
    const messages = await WorkspaceMessage.find({
      teamId: { $in: teams.map((team) => team._id) },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    const teamNames = new Map(
      teams.map((team) => [String(team._id), team.name]),
    )

    res.status(200).json(
      messages.reverse().map((message) => ({
        id: String(message._id),
        teamId: String(message.teamId),
        teamName: teamNames.get(String(message.teamId)) ?? 'Workspace',
        senderId: String(message.senderId),
        senderName: message.senderName,
        text: message.text,
        createdAt: message.createdAt,
      })),
    )
  } catch (error) {
    console.error('Could not fetch workspace messages:', error)
    res.status(500).json({ message: 'Could not fetch workspace messages.' })
  }
})

router.post('/messages', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  const { teamId, text } = req.body as {
    teamId?: unknown
    text?: unknown
  }

  if (
    typeof teamId !== 'string' ||
    !isValidId(teamId) ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.trim().length > 2000
  ) {
    res.status(400).json({ message: 'Choose a workspace and enter a message up to 2000 characters.' })
    return
  }

  try {
    const team = await WorkspaceTeam.findOne({
      _id: teamId,
      $or: [{ ownerId: req.userId }, { members: req.userId }],
    })

    if (!team) {
      res.status(403).json({ message: 'You are not a member of this workspace.' })
      return
    }

    const user = await User.findById(req.userId).select('name')

    if (!user) {
      res.status(401).json({ message: 'Your account could not be found.' })
      return
    }

    const message = await WorkspaceMessage.create({
      teamId,
      senderId: req.userId,
      senderName: user.name,
      text: text.trim(),
    })

    res.status(201).json({
      id: String(message._id),
      teamId: String(message.teamId),
      teamName: team.name,
      senderId: String(message.senderId),
      senderName: message.senderName,
      text: message.text,
      createdAt: message.createdAt,
    })
  } catch (error) {
    console.error('Could not post workspace message:', error)
    res.status(500).json({ message: 'Could not send your message.' })
  }
})

router.get('/analytics', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Authentication required.' })
    return
  }

  try {
    const teams = await getAccessibleTeams(req.userId)
    const teamIds = teams.map((team) => team._id)
    const [
      meetingCount,
      projectCount,
      activeProjectCount,
      taskCount,
      todoTaskCount,
      inProgressTaskCount,
      completedTaskCount,
      messageCount,
      summaryCount,
    ] = await Promise.all([
      Meeting.countDocuments({ createdBy: req.userId }),
      Project.countDocuments({ ownerId: req.userId }),
      Project.countDocuments({ ownerId: req.userId, status: 'active' }),
      Task.countDocuments({ ownerId: req.userId }),
      Task.countDocuments({ ownerId: req.userId, status: 'todo' }),
      Task.countDocuments({ ownerId: req.userId, status: 'in_progress' }),
      Task.countDocuments({ ownerId: req.userId, status: 'done' }),
      WorkspaceMessage.countDocuments({ teamId: { $in: teamIds } }),
      Meeting.countDocuments({
        createdBy: req.userId,
        summary: { $type: 'string', $ne: '' },
      }),
    ])
    const teamMemberIds = new Set<string>()

    for (const team of teams) {
      teamMemberIds.add(String(team.ownerId))
      team.members.forEach((memberId) =>
        teamMemberIds.add(String(memberId)),
      )
    }

    res.status(200).json({
      meetingCount,
      projectCount,
      activeProjectCount,
      taskCount,
      todoTaskCount,
      inProgressTaskCount,
      completedTaskCount,
      messageCount,
      teamMemberCount: teamMemberIds.size,
      summaryCount,
    })
  } catch (error) {
    console.error('Could not fetch workspace analytics:', error)
    res.status(500).json({ message: 'Could not fetch workspace analytics.' })
  }
})

export default router
