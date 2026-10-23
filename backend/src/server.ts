
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { createServer } from 'node:http'
import { Server } from 'socket.io'

import meetingsRouter from './routes/meetings'
import authRouter from './routes/auth'
import transcriptionRouter from './routes/transcription'
import transcriptsRouter from './routes/transcripts'

dotenv.config()

const app = express()

const PORT = Number(process.env.PORT) || 5000
const MONGODB_URI = process.env.MONGODB_URI
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

app.use(cors({ origin: CLIENT_URL }))

app.use('/api/auth', express.json({ limit: '10kb' }), authRouter)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'IntellMeet API is running.',
    database:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

app.use('/api/meetings', express.json({ limit: '4mb' }), meetingsRouter)
app.use('/api/transcription', transcriptionRouter)
app.use('/api/transcripts', express.json({ limit: '4mb' }), transcriptsRouter)

// Express and Socket.IO share the same HTTP server.
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
  if (typeof payload !== 'object' || payload === null) {
    return false
  }

  const data = payload as Record<string, unknown>

  return (
    typeof data.to === 'string' &&
    data.to.length > 0 &&
    data.to.length <= 100
  )
}

function isValidChatPayload(payload: unknown): payload is ChatSendPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false
  }

  const data = payload as Record<string, unknown>

  return typeof data.text === 'string'
}

io.on('connection', (socket) => {
  console.log(`Meeting socket connected: ${socket.id}`)

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

      // Leave the previous room if this socket joins another one.
      const previousRoomId = socket.data.roomId as string | undefined

      if (previousRoomId && previousRoomId !== roomId) {
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

      const peers = existingSocketIds.map((socketId) => {
        const peerSocket = io.sockets.sockets.get(socketId)

        return {
          socketId,
          displayName:
            (peerSocket?.data.displayName as string | undefined) ??
            'Participant',
        }
      })

      socket.emit('room:joined', { peers })

      socket.to(roomId).emit('peer:joined', {
        socketId: socket.id,
        displayName,
      })

      console.log(`${displayName} joined meeting room ${roomId}`)
    } catch (error) {
      console.error('Failed to join meeting room:', error)

      socket.emit('room:error', {
        message: 'Unable to join the meeting room.',
      })
    }
  })

  function relayToPeer(
    event: 'webrtc:offer' | 'webrtc:answer' | 'webrtc:ice',
    payload: unknown,
  ) {
    if (!isValidRelayPayload(payload)) {
      return
    }

    const roomId = socket.data.roomId as string | undefined

    if (!roomId) {
      socket.emit('room:error', {
        message: 'Join a meeting room before sending connection messages.',
      })
      return
    }

    const target = io.sockets.sockets.get(payload.to)

    // Only relay messages to another connected participant in this room.
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

  // Real-time meeting chat.
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

    // The sender name comes from room:join, not from the client message.
    io.to(roomId).emit('chat:message', {
      id: `${socket.id}-${Date.now()}`,
      senderName,
      text,
      timestamp: new Date().toISOString(),
    })
  })

  socket.on('participant:media-state', (payload: unknown) => {
    const roomId = socket.data.roomId as string | undefined

    if (!roomId) {
      return
    }

    if (typeof payload !== 'object' || payload === null) {
      return
    }

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

  socket.on('room:leave', async (payload?: { roomId?: string }) => {
    const currentRoomId = socket.data.roomId as string | undefined

    if (!currentRoomId) return

    // A client cannot make this socket leave an unrelated room.
    if (payload?.roomId && payload.roomId !== currentRoomId) {
      return
    }

    socket.to(currentRoomId).emit('peer:left', {
      socketId: socket.id,
    })

    await socket.leave(currentRoomId)

    delete socket.data.roomId
    delete socket.data.displayName

    console.log(`Socket ${socket.id} left meeting room ${currentRoomId}`)
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined

    if (roomId) {
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

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })

    console.log('MongoDB connected successfully.')

    httpServer.listen(PORT, () => {
      console.log(`IntellMeet API running at http://localhost:${PORT}`)
      console.log('Socket.IO meeting signaling server is ready.')
      console.log('Real-time meeting chat is ready.')
    })
  } catch (error) {
    console.error('Could not connect to MongoDB:', error)
    process.exit(1)
  }
}

void startServer()
