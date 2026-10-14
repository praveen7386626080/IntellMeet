import { io, type Socket } from 'socket.io-client'

// Your existing frontend/.env contains:
// VITE_API_URL=http://localhost:5000/api
//
// Socket.IO connects to the backend server root, not the /api path.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const SOCKET_URL = API_URL.replace(/\/api\/?$/, '')

export function createMeetingSocket(): Socket {
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  })
}