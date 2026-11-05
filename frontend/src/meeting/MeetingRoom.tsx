import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { Socket } from 'socket.io-client'
import { createMeetingSocket } from './meetingSocket'
import './MeetingRoom.css'
import LiveTranscript from './LiveTranscript'
import { useAuth } from '../auth/AuthContext'

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
  displayName: string
  stream: MediaStream
  audioEnabled: boolean
  cameraEnabled: boolean
}

interface RoomJoinedPayload {
  peers: PeerInfo[]
  role?: 'Host' | 'Participant'
  hostId?: string | null
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

interface ChatMessage {
  id: string
  senderName: string
  text: string
  timestamp: string
}

interface ChatErrorPayload {
  message?: string
}

interface MediaStatePayload {
  audioEnabled?: boolean
  cameraEnabled?: boolean
}

interface HandStatePayload {
  socketId: string
  displayName?: string
  raised: boolean
}

interface HandParticipant {
  socketId: string
  displayName: string
  raised: boolean
}

interface RoomEndedPayload {
  message?: string
}

type MeetingTab = 'participants' | 'chat' | 'transcript'
type MeetingRole = 'Host' | 'Participant'

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
  const { token } = useAuth()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const leavingRef = useRef(false)

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map(),
  )

  const screenSharingRef = useRef(false)
  const mutedRef = useRef(false)
  const cameraOffRef = useRef(false)
  const handRaisedRef = useRef(false)

  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState('')

  const [role, setRole] = useState<MeetingRole>('Participant')
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState<HandParticipant[]>([])

  const [activeTab, setActiveTab] =
    useState<MeetingTab>('participants')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState('')

  const updateParticipantMediaState = useCallback(
    (audioEnabled: boolean, cameraEnabled: boolean) => {
      socketRef.current?.emit('participant:media-state', {
        audioEnabled,
        cameraEnabled,
      })
    },
    [],
  )

  const removeParticipant = useCallback((socketId: string) => {
    const connection = peerConnectionsRef.current.get(socketId)

    if (connection) {
      connection.ontrack = null
      connection.onicecandidate = null
      connection.onconnectionstatechange = null
      connection.close()
      peerConnectionsRef.current.delete(socketId)
    }

    setParticipants((current) =>
      current.filter(
        (participant) => participant.socketId !== socketId,
      ),
    )

    setRaisedHands((current) =>
      current.filter((participant) => participant.socketId !== socketId),
    )
  }, [])

  const stopLocalMedia = useCallback(() => {
    screenSharingRef.current = false

    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })

    screenStreamRef.current = null

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop()
    })

    localStreamRef.current = null

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    setScreenSharing(false)
  }, [])

  const closeMeetingConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((connection) => {
      connection.ontrack = null
      connection.onicecandidate = null
      connection.onconnectionstatechange = null
      connection.close()
    })

    peerConnectionsRef.current.clear()
    stopLocalMedia()

    const socket = socketRef.current

    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [stopLocalMedia])

  const leaveMeeting = useCallback(() => {
    if (leavingRef.current) return

    leavingRef.current = true

    socketRef.current?.emit('room:leave', { roomId })

    closeMeetingConnections()
    onLeave()
  }, [closeMeetingConnections, onLeave, roomId])

  const raiseHand = useCallback(() => {
    const socket = socketRef.current

    if (!socket?.connected || handRaisedRef.current) return

    handRaisedRef.current = true
    setHandRaised(true)

    socket.emit('hand:raise', { roomId })
  }, [roomId])

  const lowerHand = useCallback(() => {
    const socket = socketRef.current

    if (!socket?.connected || !handRaisedRef.current) return

    handRaisedRef.current = false
    setHandRaised(false)

    socket.emit('hand:lower', { roomId })
  }, [roomId])

  const endMeetingForAll = useCallback(() => {
    if (role !== 'Host') return

    const confirmed = window.confirm(
      'Are you sure you want to end this meeting for everyone?',
    )

    if (!confirmed) return

    const socket = socketRef.current

    if (!socket?.connected) {
      setError('Not connected to the meeting server.')
      return
    }

    socket.emit('room:end')
  }, [role])

  useEffect(() => {
    let cancelled = false
    let socket: Socket | null = null

    const connections = peerConnectionsRef.current

    leavingRef.current = false
    handRaisedRef.current = false

    async function startMeeting() {
      try {
        if (!token) {
          setError('Authentication required. Please log in again.')
          setConnecting(false)
          return
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Camera access is unavailable. Open IntellMeet using localhost or HTTPS.',
          )
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })

        // Apply current controls because they may have changed while media permission was pending.
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !mutedRef.current
        })
        stream.getVideoTracks().forEach((track) => {
          track.enabled = !cameraOffRef.current
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        localStreamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        socket = createMeetingSocket(token)
        socketRef.current = socket

        function createPeerConnection(
          peerSocketId: string,
        ): RTCPeerConnection {
          const existing = connections.get(peerSocketId)

          if (existing) return existing

          const pc = new RTCPeerConnection(rtcConfiguration)
          connections.set(peerSocketId, pc)

          const currentStream = localStreamRef.current

          if (currentStream) {
            currentStream.getTracks().forEach((track) => {
              if (track.kind === 'audio') {
                track.enabled = !mutedRef.current
              } else if (track.kind === 'video') {
                track.enabled = !cameraOffRef.current
              }

              const sender = pc.addTrack(track, currentStream)

              if (
                track.kind === 'video' &&
                screenSharingRef.current &&
                screenStreamRef.current
              ) {
                const screenTrack =
                  screenStreamRef.current.getVideoTracks()[0]

                if (screenTrack) {
                  void sender.replaceTrack(screenTrack).catch(
                    (err: unknown) => {
                      console.error(
                        'Could not share screen with new participant:',
                        err,
                      )
                    },
                  )
                }
              }
            })
          }

          pc.ontrack = (event) => {
            const remoteStream =
              event.streams[0] ?? new MediaStream([event.track])

            setParticipants((current) => {
              const existingParticipant = current.find(
                (participant) =>
                  participant.socketId === peerSocketId,
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
                {
                  socketId: peerSocketId,
                  displayName: `Participant ${peerSocketId.slice(0, 6)}`,
                  stream: remoteStream,
                  audioEnabled: true,
                  cameraEnabled: true,
                },
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
          setRole(payload.role === 'Host' ? 'Host' : 'Participant')

          for (const peer of payload.peers ?? []) {
            if (peer.socketId !== socket?.id) {
              try {
                await makeOffer(peer.socketId)
              } catch {
                setError(
                  'Could not start a connection with a participant.',
                )
              }
            }
          }
        })

        socket.on('hand:initial-state', (states: HandStatePayload[]) => {
          if (!Array.isArray(states)) return

          setRaisedHands(
            states.map((state) => ({
              socketId: state.socketId,
              displayName: state.displayName || 'Participant',
              raised: Boolean(state.raised),
            })),
          )

          const ownState = states.find(
            (state) => state.socketId === socket?.id,
          )

          const ownHandRaised = Boolean(ownState?.raised)

          handRaisedRef.current = ownHandRaised
          setHandRaised(ownHandRaised)
        })

        socket.on('hand:state', (payload: HandStatePayload) => {
          if (!payload || typeof payload.socketId !== 'string') return

          setRaisedHands((current) => {
            const existing = current.find(
              (participant) =>
                participant.socketId === payload.socketId,
            )

            if (existing) {
              return current.map((participant) =>
                participant.socketId === payload.socketId
                  ? {
                      ...participant,
                      displayName:
                        payload.displayName ?? participant.displayName,
                      raised: Boolean(payload.raised),
                    }
                  : participant,
              )
            }

            return [
              ...current,
              {
                socketId: payload.socketId,
                displayName: payload.displayName || 'Participant',
                raised: Boolean(payload.raised),
              },
            ]
          })

          if (payload.socketId === socket?.id) {
            handRaisedRef.current = Boolean(payload.raised)
            setHandRaised(Boolean(payload.raised))
          }
        })

        socket.on('room:ended', (payload: RoomEndedPayload) => {
          if (leavingRef.current) return

          leavingRef.current = true

          closeMeetingConnections()

          window.alert(
            payload?.message ||
              'The Host has ended this meeting for everyone.',
          )

          onLeave()
        })

        socket.on('peer:joined', (payload: PeerJoinedPayload) => {
          setParticipants((current) => {
            const existing = current.find(
              (participant) =>
                participant.socketId === payload.socketId,
            )

            if (existing) {
              return current.map((participant) =>
                participant.socketId === payload.socketId
                  ? {
                      ...participant,
                      displayName:
                        payload.displayName ?? participant.displayName,
                    }
                  : participant,
              )
            }

            return current
          })
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
            setError(
              'Could not establish a connection with a participant.',
            )
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
            // ICE candidates may arrive before remote signaling is ready.
          }
        })

        socket.on('peer:left', (payload: { socketId: string }) => {
          removeParticipant(payload.socketId)
        })

        socket.on(
          'participant:media-state',
          (payload: { from: string } & MediaStatePayload) => {
            setParticipants((current) =>
              current.map((participant) =>
                participant.socketId === payload.from
                  ? {
                      ...participant,
                      audioEnabled:
                        payload.audioEnabled ??
                        participant.audioEnabled,
                      cameraEnabled:
                        payload.cameraEnabled ??
                        participant.cameraEnabled,
                    }
                  : participant,
              ),
            )
          },
        )

        socket.on('chat:message', (message: ChatMessage) => {
          if (
            !message ||
            typeof message.id !== 'string' ||
            typeof message.senderName !== 'string' ||
            typeof message.text !== 'string' ||
            typeof message.timestamp !== 'string'
          ) {
            return
          }

          setChatMessages((current) =>
            [...current, message].slice(-200),
          )

          setChatError('')
        })

        socket.on('chat:error', (payload: ChatErrorPayload) => {
          setChatError(
            payload.message || 'Could not send the chat message.',
          )
        })

        socket.on('connect_error', () => {
          setError(
            'Cannot connect to the meeting server. Check your backend.',
          )

          setConnecting(false)
        })

        socket.on('room:error', (payload: { message?: string }) => {
          setError(
            payload.message || 'Unable to join this meeting room.',
          )

          setConnecting(false)
        })

        socket.connect()
      } catch (err) {
        if (cancelled) return

        const message =
          err instanceof Error
            ? err.message
            : 'Could not start your camera.'

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

      screenStreamRef.current?.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })

      screenStreamRef.current = null

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop()
      })

      localStreamRef.current = null

      socket?.removeAllListeners()
      socket?.disconnect()

      if (socketRef.current === socket) {
        socketRef.current = null
      }
    }
  }, [
    roomId,
    displayName,
    removeParticipant,
    token,
    closeMeetingConnections,
    onLeave,
  ])

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [chatMessages, activeTab])

  // Microphone mute/unmute.
  // The MediaStreamTrack is the source used by every peer connection,
  // so disabling this track stops its audio from being sent to all peers.
  function toggleMicrophone() {
    const audioTracks =
      localStreamRef.current?.getAudioTracks() ?? []

    if (audioTracks.length === 0) {
      console.error('No microphone audio track found.')
      setError('Microphone track is unavailable.')
      return
    }

    const nextMuted = !mutedRef.current

    audioTracks.forEach((track) => {
      track.enabled = !nextMuted

      console.log('Microphone state:', {
        id: track.id,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
      })
    })

    mutedRef.current = nextMuted
    setMuted(nextMuted)

    updateParticipantMediaState(
      !nextMuted,
      !cameraOffRef.current,
    )
  }

  function toggleCamera() {
    const videoTracks =
      localStreamRef.current?.getVideoTracks() ?? []

    const nextCameraOff = !cameraOffRef.current

    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff
    })

    cameraOffRef.current = nextCameraOff
    setCameraOff(nextCameraOff)

    updateParticipantMediaState(
      !mutedRef.current,
      !nextCameraOff,
    )
  }

  async function startScreenSharing() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        'Screen sharing is not available in this browser or context. Use localhost or HTTPS.',
      )
      return
    }

    try {
      const displayStream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        })

      const screenTrack = displayStream.getVideoTracks()[0]
      const cameraTrack =
        localStreamRef.current?.getVideoTracks()[0]

      if (!screenTrack || !cameraTrack) {
        displayStream.getTracks().forEach((track) => track.stop())
        setError('The screen or camera video track is unavailable.')
        return
      }

      screenStreamRef.current = displayStream
      screenSharingRef.current = true

      try {
        const replacements = Array.from(
          peerConnectionsRef.current.values(),
        ).map(async (pc) => {
          const sender = pc.getSenders().find(
            (item) => item.track?.kind === 'video',
          )

          if (sender) {
            await sender.replaceTrack(screenTrack)
          }
        })

        await Promise.all(replacements)
      } catch {
        screenSharingRef.current = false
        screenStreamRef.current = null

        displayStream.getTracks().forEach((track) => track.stop())

        setError(
          'Could not start screen sharing with all participants.',
        )
        return
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream
      }

      setScreenSharing(true)
      setError('')

      screenTrack.onended = () => {
        void stopScreenSharing()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''

      setError(
        message.includes('NotAllowedError') ||
          message.includes('Permission denied')
          ? 'Screen sharing was cancelled or permission was denied.'
          : 'Could not start screen sharing. Please try again.',
      )
    }
  }

  async function stopScreenSharing() {
    const cameraTrack =
      localStreamRef.current?.getVideoTracks()[0]

    const screenStream = screenStreamRef.current

    if (!cameraTrack) {
      setError('Could not restore the camera video track.')
      return
    }

    try {
      const replacements = Array.from(
        peerConnectionsRef.current.values(),
      ).map(async (pc) => {
        const sender = pc.getSenders().find(
          (item) => item.track?.kind === 'video',
        )

        if (sender) {
          await sender.replaceTrack(cameraTrack)
        }
      })

      await Promise.all(replacements)
    } catch {
      setError(
        'Screen sharing stopped, but the camera could not be restored for every participant.',
      )
    }

    screenSharingRef.current = false
    screenStreamRef.current = null

    screenStream?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })

    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }

    setScreenSharing(false)
  }

  async function toggleScreenSharing() {
    if (screenSharingRef.current) {
      await stopScreenSharing()
    } else {
      await startScreenSharing()
    }
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const text = chatInput.trim()
    const socket = socketRef.current

    if (!text) return

    if (text.length > 1000) {
      setChatError('Messages must be 1000 characters or fewer.')
      return
    }

    if (!socket?.connected) {
      setChatError('Not connected to the meeting server yet.')
      return
    }

    setChatError('')
    socket.emit('chat:send', { text })
    setChatInput('')
  }

  // Pick the video grid's column count from how many tiles are on screen,
  // so tiles stay as large as possible as people join (1 → 2 → 3 → 4 columns).
  const tileCount =
    participants.length + 1 + (!connecting && participants.length === 0 ? 1 : 0)

  const gridColumns =
    tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4

  const raisedHandSocketIds = new Set(
    raisedHands
      .filter((participant) => participant.raised)
      .map((participant) => participant.socketId),
  )

  return (
    <main className="meeting-room">
      <header className="meeting-header">
        <div>
          <h1>IntellMeet</h1>
          <p>Meeting room: {roomId}</p>
          <span className="meeting-role-label">
            {role === 'Host' ? 'Host' : 'Participant'}
          </span>
        </div>

        <div className="meeting-header-actions">
          <button
            type="button"
            className="top-people-button"
            onClick={() => {
              setActiveTab('participants')
              setSidebarOpen(true)
            }}
            aria-label="Show participants"
            title="Participants"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>{participants.length + 1}</span>
          </button>

          <span className="meeting-status">
            {connecting ? 'Connecting…' : 'Meeting room'}
          </span>
        </div>
      </header>

      {error && (
        <div className="meeting-error" role="alert">
          {error}
        </div>
      )}

      <div className="meeting-main-layout">
        <section className="meeting-video-area">
          <section
            className="meeting-video-grid"
            style={{ '--cols': gridColumns } as CSSProperties}
            data-tiles={tileCount}
          >
            <article className="video-tile local-video-tile">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
              />

              <span className="video-label">
                You ({displayName})
                {role === 'Host' ? ' · Host' : ' · Participant'}
                {handRaised ? ' · ✋ Hand raised' : ''}
                {muted ? ' · Muted' : ''}
                {screenSharing ? ' · Sharing screen' : ''}
              </span>
            </article>

            {participants.map((participant) => (
              <RemoteVideoTile
                key={participant.socketId}
                participant={participant}
                handRaised={raisedHandSocketIds.has(participant.socketId)}
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

          <section
            className={`transcript-below-videos${transcriptOpen ? ' is-open' : ''}`}
          >
            <button
              type="button"
              className="transcript-below-toggle"
              aria-expanded={transcriptOpen}
              onClick={() => setTranscriptOpen((open) => !open)}
            >
              <span aria-hidden="true">▤</span>
              <span>Meeting Transcript &amp; AI Summary</span>
              <span className="transcript-toggle-chevron">
                {transcriptOpen ? '−' : '+'}
              </span>
            </button>

            {transcriptOpen && (
              <div className="transcript-below-content">
                <LiveTranscript meetingId={roomId} />
              </div>
            )}
          </section>
        </section>

        <aside className="meeting-sidebar" hidden={!sidebarOpen}>
          <div className="meeting-sidebar-drawer-header">
            <strong>
              {activeTab === 'participants'
                ? 'Participants'
                : activeTab === 'chat'
                  ? 'Meeting chat'
                  : 'Transcript & Summary'}
            </strong>

            <button
              type="button"
              className="meeting-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close side panel"
              title="Close panel"
            >
              ×
            </button>
          </div>

          <div
            className="meeting-sidebar-tabs"
            role="tablist"
            aria-label="Meeting panel tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'participants'}
              className={
                activeTab === 'participants'
                  ? 'meeting-sidebar-tab active'
                  : 'meeting-sidebar-tab'
              }
              onClick={() => setActiveTab('participants')}
            >
              <span>Participants</span>
              <span className="tab-count">
                {participants.length + 1}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={
                activeTab === 'chat'
                  ? 'meeting-sidebar-tab active'
                  : 'meeting-sidebar-tab'
              }
              onClick={() => setActiveTab('chat')}
            >
              Chat
            </button>
          </div>

          <section
            className="meeting-sidebar-panel"
            role="tabpanel"
            hidden={activeTab !== 'participants'}
          >
            <section
              className="meeting-participants"
              aria-label="Meeting participants"
            >
              <div className="meeting-participants-header">
                <h2>Participants</h2>
                <span>{participants.length + 1} in meeting</span>
              </div>

              <div className="meeting-participant-list">
                <div className="meeting-participant">
                  <div className="participant-avatar">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="participant-details">
                    <strong>
                      You ({displayName})
                      {role === 'Host' ? ' · Host' : ''}
                    </strong>
                    <span>
                      {handRaised ? '✋ Hand raised' : role}
                    </span>
                  </div>

                  <div className="participant-status">
                    <span title={muted ? 'Microphone muted' : 'Microphone on'}>
                      {muted ? '♩̸' : '♩'}
                    </span>

                    <span title={cameraOff ? 'Camera off' : 'Camera on'}>
                      {cameraOff ? '▣̸' : '▣'}
                    </span>

                    {handRaised && <span title="Hand raised">✋</span>}
                  </div>
                </div>

                {participants.map((participant) => {
                  const isHandRaised = raisedHandSocketIds.has(
                    participant.socketId,
                  )

                  return (
                    <div
                      className="meeting-participant"
                      key={participant.socketId}
                    >
                      <div className="participant-avatar">
                        {participant.displayName
                          .slice(0, 1)
                          .toUpperCase()}
                      </div>

                      <div className="participant-details">
                        <strong>{participant.displayName}</strong>
                        <span>
                          {isHandRaised ? '✋ Hand raised' : 'Connected'}
                        </span>
                      </div>

                      <div className="participant-status">
                        <span
                          title={
                            participant.audioEnabled
                              ? 'Microphone on'
                              : 'Microphone muted'
                          }
                        >
                          {participant.audioEnabled ? '🎙️' : '🔇'}
                        </span>

                        <span
                          title={
                            participant.cameraEnabled
                              ? 'Camera on'
                              : 'Camera off'
                          }
                        >
                          {participant.cameraEnabled ? '📹' : '🚫'}
                        </span>

                        {isHandRaised && (
                          <span title="Hand raised">✋</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </section>

          <section
            className="meeting-sidebar-panel"
            role="tabpanel"
            hidden={activeTab !== 'chat'}
          >
            <section
              className="meeting-chat"
              aria-label="Meeting chat"
            >
              <div className="meeting-chat-header">
                <h2>Meeting chat</h2>
                <span>{chatMessages.length} messages</span>
              </div>

              <div
                className="meeting-chat-messages"
                aria-live="polite"
              >
                {chatMessages.length === 0 ? (
                  <p className="meeting-chat-empty">
                    No messages yet. Say hello!
                  </p>
                ) : (
                  chatMessages.map((message) => {
                    const isOwnMessage =
                      message.senderName === displayName

                    return (
                      <div
                        key={message.id}
                        className={`chat-message ${
                          isOwnMessage
                            ? 'chat-message-own'
                            : 'chat-message-other'
                        }`}
                      >
                        <div className="chat-message-meta">
                          <span className="chat-sender">
                            {isOwnMessage
                              ? 'You'
                              : message.senderName}
                          </span>

                          <span className="chat-time">
                            {new Date(
                              message.timestamp,
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="chat-message-bubble">
                          {message.text}
                        </div>
                      </div>
                    )
                  })
                )}

                <div ref={chatMessagesEndRef} />
              </div>

              {chatError && (
                <p className="meeting-chat-error" role="alert">
                  {chatError}
                </p>
              )}

              <form
                className="meeting-chat-form"
                onSubmit={sendChatMessage}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(event) =>
                    setChatInput(event.target.value)
                  }
                  placeholder="Write a message..."
                  aria-label="Chat message"
                  maxLength={1000}
                  autoComplete="off"
                  disabled={connecting}
                />

                <button
                  type="submit"
                  disabled={!chatInput.trim() || connecting}
                >
                  Send
                </button>
              </form>
            </section>
          </section>
        </aside>
      </div>

      <footer className="meeting-controls">
        <button
          type="button"
          onClick={() => void toggleScreenSharing()}
          className={
            screenSharing
              ? 'meeting-control screen-share-control active'
              : 'meeting-control screen-share-control'
          }
          aria-label={
            screenSharing ? 'Stop screen sharing' : 'Share screen'
          }
          title={
            screenSharing ? 'Stop screen sharing' : 'Share screen'
          }
          disabled={connecting}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
            <rect x="3" y="4" width="18" height="13" rx="2"/>
            <path d="M8 21h8M12 17v4M12 13V7m-3 3 3-3 3 3"/>
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleMicrophone}
          className={
            muted ? 'meeting-control active' : 'meeting-control'
          }
          aria-label={
            muted ? 'Unmute microphone' : 'Mute microphone'
          }
          title={
            muted ? 'Unmute microphone' : 'Mute microphone'
          }
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>
            {muted && <path d="m3 3 18 18"/>}
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          className={
            cameraOff
              ? 'meeting-control active'
              : 'meeting-control'
          }
          aria-label={
            cameraOff ? 'Turn camera on' : 'Turn camera off'
          }
          title={
            cameraOff ? 'Turn camera on' : 'Turn camera off'
          }
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
            <rect x="3" y="6" width="13" height="12" rx="2"/>
            <path d="m16 10 5-3v10l-5-3"/>
            {cameraOff && <path d="m3 3 18 18"/>}
          </svg>
        </button>

        <button
          type="button"
          onClick={handRaised ? lowerHand : raiseHand}
          className={
            handRaised
              ? 'meeting-control raise-hand-control active'
              : 'meeting-control raise-hand-control'
          }
          aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
          title={handRaised ? 'Lower hand' : 'Raise hand'}
          disabled={connecting}
        >
          <span aria-hidden="true">✋</span>
        </button>

        <button
          type="button"
          onClick={role === 'Host' ? endMeetingForAll : leaveMeeting}
          className="meeting-control leave-control"
          aria-label={
            role === 'Host' ? 'End meeting for all' : 'Leave meeting'
          }
          title={
            role === 'Host' ? 'End meeting for all' : 'Leave meeting'
          }
          disabled={connecting}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
            <path d="M4 14.5c4.8 4.8 11.2 4.8 16 0l-3-3-3 2a12 12 0 0 1-4 0l-4-2-3 3Z" />
          </svg>
        </button>
      </footer>

      <button
        type="button"
        className={`floating-chat-button ${sidebarOpen && activeTab === 'chat' ? 'active' : ''}`}
        onClick={() => {
          if (sidebarOpen && activeTab === 'chat') {
            setSidebarOpen(false)
          } else {
            setActiveTab('chat')
            setSidebarOpen(true)
          }
        }}
        aria-label="Open chat"
        title="Chat"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="control-svg">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>
          <path d="M8 10h8M8 14h6"/>
        </svg>
      </button>
    </main>
  )
}

function RemoteVideoTile({
  participant,
  handRaised,
}: {
  participant: RemoteParticipant
  handRaised: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.srcObject = participant.stream

    return () => {
      video.srcObject = null
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
        {participant.displayName}
        {handRaised ? ' · ✋ Hand raised' : ''}
        {!participant.audioEnabled ? ' · Muted' : ''}
        {!participant.cameraEnabled ? ' · Camera off' : ''}
      </span>
    </article>
  )
}
