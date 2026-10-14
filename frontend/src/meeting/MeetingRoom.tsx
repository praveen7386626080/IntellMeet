import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { createMeetingSocket } from './meetingSocket'
import './MeetingRoom.css'

interface MeetingRoomProps {
  roomId: string
  displayName: string
  onLeave: () => void
}

interface PeerInfo {
  socketId: string
  displayName?: string
}

interface RemoteParticipant {
  socketId: string
  stream: MediaStream
}

interface RoomJoinedPayload {
  peers: PeerInfo[]
}

interface PeerJoinedPayload {
  socketId: string
  displayName?: string
}

interface OfferPayload {
  from: string
  offer: RTCSessionDescriptionInit
}

interface AnswerPayload {
  from: string
  answer: RTCSessionDescriptionInit
}

interface IcePayload {
  from: string
  candidate: RTCIceCandidateInit
}

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
}

export default function MeetingRoom({
  roomId,
  displayName,
  onLeave,
}: MeetingRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map(),
  )

  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState('')

  const removeParticipant = useCallback((socketId: string) => {
    const connection = peerConnectionsRef.current.get(socketId)

    if (connection) {
      connection.close()
      peerConnectionsRef.current.delete(socketId)
    }

    setParticipants((current) =>
      current.filter((participant) => participant.socketId !== socketId),
    )
  }, [])

  const leaveMeeting = useCallback(() => {
    socketRef.current?.emit('room:leave', { roomId })

    peerConnectionsRef.current.forEach((connection) => connection.close())
    peerConnectionsRef.current.clear()

    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null

    socketRef.current?.disconnect()
    socketRef.current = null

    onLeave()
  }, [onLeave, roomId])

  useEffect(() => {
    let cancelled = false
    let socket: Socket | null = null
    const connections = peerConnectionsRef.current

    async function startMeeting() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Camera access is unavailable. Open IntellMeet using localhost or HTTPS.',
          )
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        localStreamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        socket = createMeetingSocket()
        socketRef.current = socket

        function createPeerConnection(
          peerSocketId: string,
        ): RTCPeerConnection {
          const existing = connections.get(peerSocketId)
          if (existing) return existing

          const pc = new RTCPeerConnection(rtcConfiguration)
          connections.set(peerSocketId, pc)

          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream)
          })

          pc.ontrack = (event) => {
            const remoteStream =
              event.streams[0] ?? new MediaStream([event.track])

            setParticipants((current) => {
              const existingParticipant = current.find(
                (participant) => participant.socketId === peerSocketId,
              )

              if (existingParticipant) {
                if (existingParticipant.stream === remoteStream) {
                  return current
                }

                return current.map((participant) =>
                  participant.socketId === peerSocketId
                    ? { ...participant, stream: remoteStream }
                    : participant,
                )
              }

              return [
                ...current,
                { socketId: peerSocketId, stream: remoteStream },
              ]
            })
          }

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket?.emit('webrtc:ice', {
                to: peerSocketId,
                candidate: event.candidate.toJSON(),
              })
            }
          }

          pc.onconnectionstatechange = () => {
            if (
              pc.connectionState === 'failed' ||
              pc.connectionState === 'closed'
            ) {
              removeParticipant(peerSocketId)
            }
          }

          return pc
        }

        async function makeOffer(peerSocketId: string) {
          const pc = createPeerConnection(peerSocketId)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          socket?.emit('webrtc:offer', {
            to: peerSocketId,
            offer: pc.localDescription,
          })
        }

        socket.on('connect', () => {
          socket?.emit('room:join', {
            roomId,
            displayName,
          })
        })

        socket.on('room:joined', async (payload: RoomJoinedPayload) => {
          if (cancelled) return

          setConnecting(false)
          setError('')

          for (const peer of payload.peers ?? []) {
            if (peer.socketId !== socket?.id) {
              try {
                await makeOffer(peer.socketId)
              } catch {
                setError('Could not start a connection with a participant.')
              }
            }
          }
        })

        socket.on('peer:joined', (_payload: PeerJoinedPayload) => {
          // Existing participants will receive the new participant's
          // offer when that participant initiates a connection.
        })

        socket.on('webrtc:offer', async (payload: OfferPayload) => {
          try {
            const pc = createPeerConnection(payload.from)

            await pc.setRemoteDescription(
              new RTCSessionDescription(payload.offer),
            )

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            socket?.emit('webrtc:answer', {
              to: payload.from,
              answer: pc.localDescription,
            })
          } catch {
            setError('Could not establish a connection with a participant.')
          }
        })

        socket.on('webrtc:answer', async (payload: AnswerPayload) => {
          try {
            const pc = connections.get(payload.from)

            if (pc && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload.answer),
              )
            }
          } catch {
            setError('Could not complete the video connection.')
          }
        })

        socket.on('webrtc:ice', async (payload: IcePayload) => {
          try {
            const pc = connections.get(payload.from)

            if (pc) {
              await pc.addIceCandidate(
                new RTCIceCandidate(payload.candidate),
              )
            }
          } catch {
            // An ICE candidate can arrive before remote signaling is ready.
            // A production implementation should queue early candidates.
          }
        })

        socket.on('peer:left', (payload: { socketId: string }) => {
          removeParticipant(payload.socketId)
        })

        socket.on('connect_error', () => {
          setError('Cannot connect to the meeting server. Check your backend.')
          setConnecting(false)
        })

        socket.on('room:error', (payload: { message?: string }) => {
          setError(payload.message || 'Unable to join this meeting room.')
          setConnecting(false)
        })

        socket.connect()
      } catch (err) {
        if (cancelled) return

        const message =
          err instanceof Error ? err.message : 'Could not start your camera.'

        setError(
          message.includes('Permission denied') ||
            message.includes('NotAllowedError')
            ? 'Camera or microphone permission was denied. Allow access in your browser and try again.'
            : message,
        )
        setConnecting(false)
      }
    }

    void startMeeting()

    return () => {
      cancelled = true

      connections.forEach((connection) => connection.close())
      connections.clear()

      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null

      socket?.removeAllListeners()
      socket?.disconnect()

      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [roomId, displayName, removeParticipant])

  function toggleMicrophone() {
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? []
    const nextMuted = !muted

    audioTracks.forEach((track) => {
      track.enabled = !nextMuted
    })

    setMuted(nextMuted)
  }

  function toggleCamera() {
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? []
    const nextCameraOff = !cameraOff

    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff
    })

    setCameraOff(nextCameraOff)
  }

  return (
    <main className="meeting-room">
      <header className="meeting-header">
        <div>
          <h1>IntellMeet</h1>
          <p>Meeting room: {roomId}</p>
        </div>

        <span className="meeting-status">
          {connecting ? 'Connecting…' : 'Meeting room'}
        </span>
      </header>

      {error && (
        <div className="meeting-error" role="alert">
          {error}
        </div>
      )}

      <section className="meeting-video-grid">
        <article className="video-tile local-video-tile">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
          />
          <span className="video-label">
            You ({displayName}){muted ? ' · Muted' : ''}
          </span>
        </article>

        {participants.map((participant) => (
          <RemoteVideoTile
            key={participant.socketId}
            participant={participant}
          />
        ))}

        {!connecting && participants.length === 0 && (
          <div className="meeting-empty-state">
            <h2>You're in the meeting</h2>
            <p>Waiting for other participants to join…</p>
            <p>Share this meeting ID: {roomId}</p>
          </div>
        )}
      </section>

      <footer className="meeting-controls">
        <button
          type="button"
          onClick={toggleMicrophone}
          className={muted ? 'meeting-control active' : 'meeting-control'}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          title={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🎙️'}</span>
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          className={cameraOff ? 'meeting-control active' : 'meeting-control'}
          aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
          title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
        >
          <span aria-hidden="true">{cameraOff ? '🚫' : '📹'}</span>
        </button>

        <button
          type="button"
          onClick={leaveMeeting}
          className="meeting-control leave-control"
          aria-label="Leave meeting"
          title="Leave meeting"
        >
          <span aria-hidden="true">📞</span>
        </button>
      </footer>
    </main>
  )
}

function RemoteVideoTile({
  participant,
}: {
  participant: RemoteParticipant
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream
    }
  }, [participant.stream])

  return (
    <article className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
      />
      <span className="video-label">
        Participant {participant.socketId.slice(0, 6)}
      </span>
    </article>
  )
}
