
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { createServer } from 'node:http'
import { Server } from 'socket.io'

import meetingsRouter from './routes/meetings'
import authRouter from './routes/auth'
import transcriptsRouter from './routes/transcripts'
import workspaceRouter from './routes/workspace'
import profileRouter from './routes/profile'
import Meeting from './Models/Meeting'

import passport from 'passport'
import { configurePassport } from './config/passport'

dotenv.config()
configurePassport()

const app = express()

const PORT = Number(process.env.PORT) || 5000
const MONGODB_URI = process.env.MONGODB_URI
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

app.use(cors({ origin: CLIENT_URL }))
app.use(passport.initialize())

app.use('/api/auth', express.json({ limit: '10kb' }), authRouter)
app.use('/api/profile', express.json({ limit: '10kb' }), profileRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'IntellMeet API is running.',
    database:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/api/meetings', express.json({ limit: '4mb' }), meetingsRouter)
app.use('/api/transcripts', express.json({ limit: '4mb' }), transcriptsRouter)
app.use('/api/workspace', express.json({ limit: '32kb' }), workspaceRouter)

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
})

interface JoinRoomPayload {
  roomId: string
  displayName: string
}

interface RelayPayload {
  to: string
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

interface ChatSendPayload {
  text: string
}

io.use((socket, next) => {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    console.error('JWT_SECRET is not configured.')
    return next(new Error('Authentication is not configured.'))
  }

  const authToken = socket.handshake.auth?.token

  if (typeof authToken !== 'string' || !authToken.trim()) {
    return next(new Error('Authentication required. Please log in.'))
  }

  const token = authToken.startsWith('Bearer ')
    ? authToken.slice('Bearer '.length).trim()
    : authToken.trim()

  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'intellmeet-api',
      audience: 'intellmeet-web',
    })

    if (
      typeof decoded === 'string' ||
      typeof (decoded as JwtPayload).sub !== 'string'
    ) {
      return next(new Error('Invalid authentication token.'))
    }

    socket.data.userId = (decoded as JwtPayload).sub
    next()
  } catch {
    return next(
      new Error('Your session is invalid or expired. Please log in again.'),
    )
  }
})

function isValidRoomId(roomId: unknown): roomId is string {
  return (
    typeof roomId === 'string' &&
    roomId.length >= 1 &&
    roomId.length <= 100 &&
    /^[a-zA-Z0-9_-]+$/.test(roomId)
  )
}

function isValidDisplayName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim().length >= 1 &&
    name.trim().length <= 80
  )
}

function isValidRelayPayload(payload: unknown): payload is RelayPayload {
  if (typeof payload !== 'object' || payload === null) return false

  const data = payload as Record<string, unknown>

  return (
    typeof data.to === 'string' &&
    data.to.length > 0 &&
    data.to.length <= 100
  )
}

function isValidChatPayload(payload: unknown): payload is ChatSendPayload {
  if (typeof payload !== 'object' || payload === null) return false

  const data = payload as Record<string, unknown>
  return typeof data.text === 'string'
}

io.on('connection', (socket) => {
  console.log(
    `Meeting socket connected: ${socket.id} | User: ${socket.data.userId}`,
  )

  socket.on('room:join', async (payload: JoinRoomPayload) => {
    try {
      if (
        !payload ||
        !isValidRoomId(payload.roomId) ||
        !isValidDisplayName(payload.displayName)
      ) {
        socket.emit('room:error', {
          message: 'A valid room ID and display name are required.',
        })
        return
      }

      const roomId = payload.roomId
      const displayName = payload.displayName.trim()
      const userId = socket.data.userId as string

      // Verify that this is an existing scheduled meeting.
      const meeting = await Meeting.findById(roomId).select('createdBy').lean()

      if (!meeting) {
        socket.emit('room:error', {
          message: 'Meeting not found. Please check the Meeting ID.',
        })
        return
      }

      // The meeting creator is the Host. Everyone else is a Participant.
      const createdBy = meeting.createdBy
        ? String(meeting.createdBy)
        : null

      const role = createdBy && createdBy === userId
        ? 'Host'
        : 'Participant'

      const previousRoomId = socket.data.roomId as string | undefined

      if (previousRoomId && previousRoomId !== roomId) {
        if (socket.data.handRaised) {
          io.to(previousRoomId).emit('hand:state', {
            socketId: socket.id,
            displayName:
              (socket.data.displayName as string | undefined) ?? 'Participant',
            raised: false,
          })
        }

        socket.to(previousRoomId).emit('peer:left', {
          socketId: socket.id,
        })

        await socket.leave(previousRoomId)
      }

      const existingSocketIds = [
        ...(io.sockets.adapter.rooms.get(roomId) ?? []),
      ].filter((id) => id !== socket.id)

      await socket.join(roomId)

      socket.data.roomId = roomId
      socket.data.displayName = displayName
      socket.data.role = role
      socket.data.meetingHostId = createdBy

      const peers = existingSocketIds.map((socketId) => {
        const peerSocket = io.sockets.sockets.get(socketId)

        return {
          socketId,
          displayName:
            (peerSocket?.data.displayName as string | undefined) ??
            'Participant',
        }
      })

      socket.emit('room:joined', {
        peers,
        role,
        hostId: createdBy,
      })

      socket.to(roomId).emit('peer:joined', {
        socketId: socket.id,
        displayName,
      })

      const handStates = [
        ...(io.sockets.adapter.rooms.get(roomId) ?? []),
      ].map((socketId) => {
        const peerSocket = io.sockets.sockets.get(socketId)

        return {
          socketId,
          displayName:
            (peerSocket?.data.displayName as string | undefined) ??
            'Participant',
          raised: Boolean(peerSocket?.data.handRaised),
        }
      })

      socket.emit('hand:initial-state', handStates)

      console.log(
        `${displayName} (${role}) joined meeting room ${roomId}`,
      )
    } catch (error) {
      console.error('Failed to join meeting room:', error)

      socket.emit('room:error', {
        message: 'Unable to join the meeting room.',
      })
    }
  })

  // Only the verified Host can end the meeting for everyone.
  socket.on('room:end', async () => {
    try {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined

      if (!roomId || !userId) {
        socket.emit('room:error', {
          message: 'Join a meeting before ending it.',
        })
        return
      }

      // Verify ownership again from MongoDB; never trust the client role.
      const meeting = await Meeting.findById(roomId)
        .select('createdBy')
        .lean()

      if (!meeting || !meeting.createdBy ||
          String(meeting.createdBy) !== userId) {
        socket.emit('room:error', {
          message: 'Only the meeting Host can end this meeting for everyone.',
        })
        return
      }

      const roomSockets = [
        ...(io.sockets.adapter.rooms.get(roomId) ?? []),
      ]

      // Notify everyone before disconnecting their meeting sockets.
      io.to(roomId).emit('room:ended', {
        message: 'The Host has ended this meeting for everyone.',
      })

      for (const socketId of roomSockets) {
        const participantSocket = io.sockets.sockets.get(socketId)

        if (participantSocket) {
          delete participantSocket.data.roomId
          delete participantSocket.data.displayName
          delete participantSocket.data.role
          delete participantSocket.data.meetingHostId
          delete participantSocket.data.handRaised

          await participantSocket.leave(roomId)
        }
      }

      console.log(`Host ${userId} ended live meeting room ${roomId}`)
    } catch (error) {
      console.error('Failed to end meeting:', error)

      socket.emit('room:error', {
        message: 'Unable to end the meeting. Please try again.',
      })
    }
  })

  function relayToPeer(
    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice',
    payload: unknown,
  ) {
    if (!isValidRelayPayload(payload)) return

    const roomId = socket.data.roomId as string | undefined

    if (!roomId) {
      socket.emit('room:error', {
        message: 'Join a meeting room before sending connection messages.',
      })
      return
    }

    const target = io.sockets.sockets.get(payload.to)

    if (
      !target ||
      !target.rooms.has(roomId) ||
      target.id === socket.id
    ) {
      return
    }

    const data = payload as RelayPayload

    if (event === 'webrtc:offer' && !data.offer) return
    if (event === 'webrtc:answer' && !data.answer) return
    if (event === 'webrtc:ice' && !data.candidate) return

    io.to(target.id).emit(event, {
      from: socket.id,
      ...(event === 'webrtc:offer' ? { offer: data.offer } : {}),
      ...(event === 'webrtc:answer' ? { answer: data.answer } : {}),
      ...(event === 'webrtc:ice' ? { candidate: data.candidate } : {}),
    })
  }

  socket.on('webrtc:offer', (payload: unknown) => {
    relayToPeer('webrtc:offer', payload)
  })

  socket.on('webrtc:answer', (payload: unknown) => {
    relayToPeer('webrtc:answer', payload)
  })

  socket.on('webrtc:ice', (payload: unknown) => {
    relayToPeer('webrtc:ice', payload)
  })

  // Raise Hand.
  socket.on('hand:raise', (payload: unknown) => {
    const roomId = socket.data.roomId as string | undefined
    const displayName = socket.data.displayName as string | undefined

    if (!roomId || !displayName) {
      socket.emit('room:error', {
        message: 'Join a meeting before raising your hand.',
      })
      return
    }

    if (
      payload !== undefined &&
      (
        !payload ||
        typeof payload !== 'object' ||
        (payload as Record<string, unknown>).roomId !== roomId
      )
    ) {
      socket.emit('room:error', {
        message: 'Invalid raise-hand request.',
      })
      return
    }

    socket.data.handRaised = true

    io.to(roomId).emit('hand:state', {
      socketId: socket.id,
      displayName,
      raised: true,
    })
  })

  // Lower Hand.
  socket.on('hand:lower', (payload: unknown) => {
    const roomId = socket.data.roomId as string | undefined
    const displayName = socket.data.displayName as string | undefined

    if (!roomId || !displayName) {
      socket.emit('room:error', {
        message: 'Join a meeting before lowering your hand.',
      })
      return
    }

    if (
      payload !== undefined &&
      (
        !payload ||
        typeof payload !== 'object' ||
        (payload as Record<string, unknown>).roomId !== roomId
      )
    ) {
      socket.emit('room:error', {
        message: 'Invalid lower-hand request.',
      })
      return
    }

    socket.data.handRaised = false

    io.to(roomId).emit('hand:state', {
      socketId: socket.id,
      displayName,
      raised: false,
    })
  })

  // Meeting chat.
  socket.on('chat:send', (payload: unknown) => {
    const roomId = socket.data.roomId as string | undefined
    const senderName = socket.data.displayName as string | undefined

    if (!roomId || !senderName) {
      socket.emit('chat:error', {
        message: 'Join a meeting before sending chat messages.',
      })
      return
    }

    if (!isValidChatPayload(payload)) {
      socket.emit('chat:error', {
        message: 'Invalid chat message.',
      })
      return
    }

    const text = payload.text.trim()

    if (text.length === 0 || text.length > 1000) {
      socket.emit('chat:error', {
        message: 'Messages must contain between 1 and 1000 characters.',
      })
      return
    }

    io.to(roomId).emit('chat:message', {
      id: `${socket.id}-${Date.now()}`,
      senderName,
      text,
      timestamp: new Date().toISOString(),
    })
  })

  // Participant microphone and camera state.
  socket.on('participant:media-state', (payload: unknown) => {
    const roomId = socket.data.roomId as string | undefined

    if (!roomId) return
    if (typeof payload !== 'object' || payload === null) return

    const data = payload as Record<string, unknown>

    if (
      typeof data.audioEnabled !== 'boolean' &&
      typeof data.cameraEnabled !== 'boolean'
    ) {
      return
    }

    socket.to(roomId).emit('participant:media-state', {
      from: socket.id,
      audioEnabled: Boolean(data.audioEnabled),
      cameraEnabled: Boolean(data.cameraEnabled),
    })
  })

  // Leave Meeting.
  socket.on('room:leave', async (payload?: { roomId?: string }) => {
    const currentRoomId = socket.data.roomId as string | undefined

    if (!currentRoomId) return

    if (payload?.roomId && payload.roomId !== currentRoomId) return

    if (socket.data.handRaised) {
      io.to(currentRoomId).emit('hand:state', {
        socketId: socket.id,
        displayName:
          (socket.data.displayName as string | undefined) ?? 'Participant',
        raised: false,
      })
    }

    socket.to(currentRoomId).emit('peer:left', {
      socketId: socket.id,
    })

    await socket.leave(currentRoomId)

    delete socket.data.handRaised
    delete socket.data.roomId
    delete socket.data.displayName
    delete socket.data.role
    delete socket.data.meetingHostId

    console.log(
      `Socket ${socket.id} left meeting room ${currentRoomId}`,
    )
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined

    if (roomId) {
      if (socket.data.handRaised) {
        io.to(roomId).emit('hand:state', {
          socketId: socket.id,
          displayName:
            (socket.data.displayName as string | undefined) ?? 'Participant',
          raised: false,
        })
      }

      socket.to(roomId).emit('peer:left', {
        socketId: socket.id,
      })
    }

    console.log(`Meeting socket disconnected: ${socket.id}`)
  })
})

async function startServer() {
  if (
    !MONGODB_URI ||
    MONGODB_URI.includes('YOUR_USERNAME') ||
    MONGODB_URI.includes('YOUR_PASSWORD') ||
    MONGODB_URI.includes('YOUR-CLUSTER') ||
    MONGODB_URI.includes('<db_password>')
  ) {
    console.error('Please configure MONGODB_URI in backend/.env')
    process.exit(1)
  }

  if (!process.env.JWT_SECRET) {
    console.error('Please configure JWT_SECRET in backend/.env')
    process.exit(1)
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })

    console.log('MongoDB connected successfully.')

    httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`IntellMeet API running on port ${PORT}`)
  console.log('Socket.IO meeting signaling server is ready.')
  console.log('Real-time meeting chat is ready.')
  console.log('Real-time raise-hand support is ready.')
  console.log('Socket.IO JWT authentication is enabled.')
  console.log('Host-only End Meeting support is ready.')
})
  } catch (error) {
    console.error('Could not connect to MongoDB:', error)
    process.exit(1)
  }
}

void startServer()
