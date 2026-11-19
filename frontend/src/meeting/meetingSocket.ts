
import { io, type Socket } from 'socket.io-client'
import { getApiUrl } from '../config/api'

// Socket.IO connects to the backend server root, not the /api path.
const API_URL = getApiUrl()

const SOCKET_URL = API_URL.replace(/\/api\/?$/, '')

export function createMeetingSocket(token: string): Socket {
  return io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: {
      token,
    },
  })
}
