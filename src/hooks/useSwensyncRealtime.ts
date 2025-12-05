'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  SwensyncConnectionState,
  SwensyncAnimState,
  SwensyncRealtimeOptions,
  SwensyncRealtimeHook,
  TurnLatency,
} from '@/types/swensync';

// Dynamic import for MicVAD to avoid SSR issues
let MicVADClass: typeof import('@ricky0123/vad-web').MicVAD | null = null;

/**
 * Session limits (in seconds)
 */
const SESSION_WARNING_TIME = 8 * 60; // 8 minutes
const SESSION_MAX_TIME = 10 * 60; // 10 minutes

/**
 * OpenAI Realtime API WebRTC endpoint
 * Note: Model is passed in query parameter for /v1/realtime endpoint
 */
const OPENAI_REALTIME_ENDPOINT = 'https://api.openai.com/v1/realtime';
const OPENAI_MODEL = 'gpt-4o-realtime-preview';

/**
 * Maximum number of turn latencies to keep
 */
const MAX_LATENCY_HISTORY = 5;

/**
 * Custom hook for OpenAI Realtime API connection using native WebRTC.
 *
 * This hook provides:
 * - Native WebRTC connection to OpenAI Realtime API
 * - Microphone capture via getUserMedia
 * - Audio context and analyser for visualization
 * - Animation state machine (Listening/Focused/Thinking/Speaking)
 * - Session timer with warning and auto-disconnect
 * - Turn-by-turn latency tracking
 *
 * @param {SwensyncRealtimeOptions} options - Hook options including user name for personalization
 * @returns {SwensyncRealtimeHook} Hook state and controls
 */
export function useSwensyncRealtime(
  options: SwensyncRealtimeOptions = {}
): SwensyncRealtimeHook {
  const { userName, useClientVAD = true } = options;

  // Connection state
  const [connectionState, setConnectionState] =
    useState<SwensyncConnectionState>('idle');
  const [error, setError] = useState<Error | null>(null);

  // Animation state
  const [animState, setAnimState] = useState<SwensyncAnimState>('Listening');
  const [isVisualizerActive, setIsVisualizerActive] = useState(false);

  // Session management
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isSessionExpiring, setIsSessionExpiring] = useState(false);

  // Audio analysis for visualization
  const [modelAnalyserNode, setModelAnalyserNode] =
    useState<AnalyserNode | null>(null);

  // Latency tracking state
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [turnLatencies, setTurnLatencies] = useState<TurnLatency[]>([]);
  const [currentTurnNumber, setCurrentTurnNumber] = useState(0);

  // Use ref for turn number to avoid stale closure in callbacks
  const currentTurnNumberRef = useRef(0);

  // Refs for WebRTC resources
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  // Latency tracking refs
  const stopwatchStartRef = useRef<number | null>(null);
  const stopwatchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isWaitingForResponseRef = useRef<boolean>(false);

  // Flag to prevent race conditions
  const isConnectingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Audio monitoring refs
  const audioMonitorIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isResponseCompleteRef = useRef<boolean>(false);
  const silentFrameCountRef = useRef<number>(0);
  const audioStreamEndTimeRef = useRef<number>(0);

  // Client-side VAD refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientVADRef = useRef<any>(null);
  const isClientVADActiveRef = useRef<boolean>(false);
  const clientVADSpeechStartTimeRef = useRef<number | null>(null);

  // Thresholds for silence detection
  const SILENCE_THRESHOLD = 2;
  const SILENT_FRAMES_REQUIRED = 25;
  const MIN_SILENCE_DELAY_MS = 500;

  /**
   * Fetch ephemeral token from our backend
   */
  const fetchToken = useCallback(async (): Promise<string> => {
    const res = await fetch('/api/swensync-realtime-token');
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get realtime token');
    }
    const data = await res.json();
    if (!data.client_secret?.value) {
      throw new Error('Invalid token response: missing client_secret');
    }
    return data.client_secret.value;
  }, []);

  /**
   * Start session timer
   */
  const startSessionTimer = useCallback(() => {
    sessionStartRef.current = Date.now();

    sessionTimerRef.current = setInterval(() => {
      if (!sessionStartRef.current) return;

      const elapsed = Math.floor(
        (Date.now() - sessionStartRef.current) / 1000
      );
      setSessionDuration(elapsed);

      // Warning at 8 minutes
      if (elapsed >= SESSION_WARNING_TIME) {
        setIsSessionExpiring(true);
      }

      // Auto-disconnect at 10 minutes
      if (elapsed >= SESSION_MAX_TIME) {
        console.log('[Swensync] Session timeout: auto-disconnecting');
      }
    }, 1000);
  }, []);

  /**
   * Stop session timer
   */
  const stopSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionStartRef.current = null;
    setSessionDuration(0);
    setIsSessionExpiring(false);
  }, []);

  /**
   * Start the latency stopwatch
   */
  const startStopwatch = useCallback(() => {
    stopwatchStartRef.current = Date.now();
    setIsStopwatchRunning(true);
    setStopwatchElapsed(0);
    isWaitingForResponseRef.current = true;

    // Update elapsed time every 16ms (~60fps)
    stopwatchIntervalRef.current = setInterval(() => {
      if (stopwatchStartRef.current) {
        setStopwatchElapsed(Date.now() - stopwatchStartRef.current);
      }
    }, 16);

    console.log('[Swensync] Stopwatch started');
  }, []);

  /**
   * Stop the latency stopwatch and record the latency
   */
  const stopStopwatch = useCallback(() => {
    if (!stopwatchStartRef.current || !isWaitingForResponseRef.current) return;

    const latencyMs = Date.now() - stopwatchStartRef.current;

    // Clear interval
    if (stopwatchIntervalRef.current) {
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }

    // Record the latency - use ref to get current value
    const newTurn = currentTurnNumberRef.current + 1;
    currentTurnNumberRef.current = newTurn;

    const newLatency: TurnLatency = {
      turnNumber: newTurn,
      latencyMs,
      timestamp: new Date(),
    };

    setTurnLatencies((prev) => {
      const updated = [newLatency, ...prev];
      return updated.slice(0, MAX_LATENCY_HISTORY);
    });

    setCurrentTurnNumber(newTurn);
    setStopwatchElapsed(latencyMs);
    setIsStopwatchRunning(false);
    stopwatchStartRef.current = null;
    isWaitingForResponseRef.current = false;

    console.log(`[Swensync] Stopwatch stopped: Turn ${newTurn} = ${latencyMs}ms`);
  }, []); // No dependencies - uses refs

  /**
   * Setup audio analyser for visualization from MediaStream
   */
  const setupAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    try {
      // Create audio context if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create analyser node
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      // Connect MediaStream to analyser
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      analyserRef.current = analyser;
      setModelAnalyserNode(analyser);

      console.log('[Swensync] Audio analyser setup complete');
    } catch (err) {
      console.warn('[Swensync] Failed to setup audio analyser:', err);
    }
  }, []);

  /**
   * Start monitoring audio levels to detect when playback ends
   */
  const startAudioMonitor = useCallback(() => {
    if (audioMonitorIntervalRef.current) {
      clearInterval(audioMonitorIntervalRef.current);
    }

    silentFrameCountRef.current = 0;

    audioMonitorIntervalRef.current = setInterval(() => {
      if (!isResponseCompleteRef.current || !analyserRef.current) {
        return;
      }

      const timeSinceStreamEnd = Date.now() - audioStreamEndTimeRef.current;
      if (
        audioStreamEndTimeRef.current > 0 &&
        timeSinceStreamEnd < MIN_SILENCE_DELAY_MS
      ) {
        return;
      }

      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      const average =
        dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;

      if (average < SILENCE_THRESHOLD) {
        silentFrameCountRef.current++;

        if (silentFrameCountRef.current >= SILENT_FRAMES_REQUIRED) {
          console.log('[Swensync] Silence detected - switching to Listening');
          setAnimState('Listening');
          setIsVisualizerActive(false);
          isResponseCompleteRef.current = false;
          silentFrameCountRef.current = 0;
        }
      } else {
        silentFrameCountRef.current = 0;
        setAnimState('Speaking');
        setIsVisualizerActive(true);
      }
    }, 33); // ~30fps monitoring
  }, []);

  /**
   * Stop audio monitoring
   */
  const stopAudioMonitor = useCallback(() => {
    if (audioMonitorIntervalRef.current) {
      clearInterval(audioMonitorIntervalRef.current);
      audioMonitorIntervalRef.current = null;
    }
    isResponseCompleteRef.current = false;
    silentFrameCountRef.current = 0;
  }, []);

  /**
   * Send commit signal to OpenAI to trigger immediate response
   * This is called by client-side VAD when speech end is detected locally
   */
  const sendCommitSignal = useCallback(() => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === 'open') {
      // Commit the audio buffer to trigger immediate processing
      const commitMsg = {
        type: 'input_audio_buffer.commit',
      };
      dc.send(JSON.stringify(commitMsg));
      console.log('[Swensync] Client VAD: Sent commit signal (local speech end detected)');
    }
  }, []);

  /**
   * Initialize client-side Silero VAD for faster turn detection
   * This runs in parallel with server VAD but can trigger response faster
   */
  const initializeClientVAD = useCallback(async (stream: MediaStream) => {
    if (!useClientVAD) {
      console.log('[Swensync] Client VAD disabled');
      return;
    }

    try {
      // Dynamic import to avoid SSR issues
      if (!MicVADClass) {
        const vadModule = await import('@ricky0123/vad-web');
        MicVADClass = vadModule.MicVAD;
      }

      console.log('[Swensync] Initializing client-side Silero VAD...');

      // Local paths for ONNX model and WASM files (served from /public/vad/)
      // Files are copied from node_modules during build
      const VAD_BASE_PATH = '/vad/';

      const vad = await MicVADClass.new({
        // Asset paths - load from local public directory
        baseAssetPath: VAD_BASE_PATH,
        onnxWASMBasePath: VAD_BASE_PATH,

        // Use the existing stream instead of requesting a new one
        getStream: async () => stream,
        // Don't stop the stream when pausing VAD
        pauseStream: async () => {},
        resumeStream: async () => stream,

        // Aggressive settings for fast turn detection
        // Lower threshold = more sensitive to speech
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.35,

        // Fast redemption - only wait 200ms of silence before triggering end
        // This is the KEY latency improvement: server VAD waits 350ms, we wait 200ms
        redemptionMs: 200,

        // Minimal pre-speech padding (we don't need the audio, just the signal)
        preSpeechPadMs: 0,

        // Minimum speech duration to avoid false positives
        minSpeechMs: 150,

        // Use v5 model for better accuracy
        model: 'v5',

        // Callbacks
        onSpeechStart: () => {
          console.log('[Swensync] Client VAD: Speech started');
          clientVADSpeechStartTimeRef.current = Date.now();
          isClientVADActiveRef.current = true;
        },

        onSpeechEnd: () => {
          if (!isClientVADActiveRef.current) return;

          const duration = clientVADSpeechStartTimeRef.current
            ? Date.now() - clientVADSpeechStartTimeRef.current
            : 0;
          console.log(`[Swensync] Client VAD: Speech ended (${duration}ms) - sending commit`);

          // Send commit signal to OpenAI immediately
          sendCommitSignal();

          isClientVADActiveRef.current = false;
          clientVADSpeechStartTimeRef.current = null;
        },

        onVADMisfire: () => {
          console.log('[Swensync] Client VAD: Misfire (too short)');
          isClientVADActiveRef.current = false;
          clientVADSpeechStartTimeRef.current = null;
        },
      });

      clientVADRef.current = vad;
      await vad.start();
      console.log('[Swensync] Client VAD initialized and running');
    } catch (err) {
      console.warn('[Swensync] Failed to initialize client VAD:', err);
      // Non-fatal - server VAD will still work
    }
  }, [useClientVAD, sendCommitSignal]);

  /**
   * Cleanup client VAD
   */
  const cleanupClientVAD = useCallback(async () => {
    if (clientVADRef.current) {
      try {
        await clientVADRef.current.destroy();
        console.log('[Swensync] Client VAD destroyed');
      } catch (err) {
        console.warn('[Swensync] Error destroying client VAD:', err);
      }
      clientVADRef.current = null;
    }
    isClientVADActiveRef.current = false;
    clientVADSpeechStartTimeRef.current = null;
  }, []);

  /**
   * Handle incoming data channel messages for animation state
   */
  const handleDataChannelMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Log important events
        const importantEvents = [
          'session.created',
          'session.updated',
          'error',
          'response.created',
          'response.done',
          'response.audio.done',
          'input_audio_buffer.speech_started',
          'input_audio_buffer.speech_stopped',
        ];
        if (importantEvents.includes(data.type)) {
          console.log('[Swensync] Event:', data.type);
        }

        switch (data.type) {
          case 'response.audio.delta':
          case 'response.audio_transcript.delta':
            // First audio delta - stop stopwatch if waiting
            if (isWaitingForResponseRef.current) {
              stopStopwatch();
            }

            isResponseCompleteRef.current = false;
            silentFrameCountRef.current = 0;
            audioStreamEndTimeRef.current = 0;
            setAnimState('Speaking');
            setIsVisualizerActive(true);
            break;

          case 'response.audio.done':
            console.log('[Swensync] Audio stream complete');
            audioStreamEndTimeRef.current = Date.now();
            isResponseCompleteRef.current = true;
            break;

          case 'response.done':
            console.log('[Swensync] Response complete');
            isResponseCompleteRef.current = true;
            break;

          case 'input_audio_buffer.speech_started':
            // User started speaking
            console.log('[Swensync] User speaking');
            setAnimState('Focused');
            setIsVisualizerActive(false);
            break;

          case 'input_audio_buffer.speech_stopped':
            // User stopped speaking - start stopwatch NOW (true latency measurement)
            // This measures: end of speech → first audio byte (excludes user speech duration)
            console.log('[Swensync] User stopped - Thinking (stopwatch started)');
            startStopwatch();
            setAnimState('Thinking');
            setIsVisualizerActive(false);
            break;

          case 'session.created':
            console.log('[Swensync] Session created:', data.session?.id);
            break;

          case 'error':
            console.error('[Swensync] Server error:', data.error);
            setError(new Error(data.error?.message || 'Server error'));
            break;
        }
      } catch {
        // Not JSON or parse error - ignore
      }
    },
    [startStopwatch, stopStopwatch]
  );

  /**
   * Connect to OpenAI Realtime API using native WebRTC
   */
  const connect = useCallback(async () => {
    // Prevent multiple concurrent connection attempts
    if (isConnectingRef.current) {
      console.warn('[Swensync] Connection already in progress');
      return;
    }

    if (connectionState !== 'idle') {
      console.warn('[Swensync] Already connecting or connected');
      return;
    }

    isConnectingRef.current = true;

    try {
      setConnectionState('connecting');
      setError(null);
      console.log('[Swensync] Initiating WebRTC connection');

      // 1. Get ephemeral token
      const token = await fetchToken();
      console.log('[Swensync] Token acquired');

      // Check if we should abort
      if (!isMountedRef.current) {
        console.log('[Swensync] Aborting - component unmounted');
        isConnectingRef.current = false;
        return;
      }

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // 3. Setup audio element for playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;

      // Handle incoming audio track from OpenAI
      pc.ontrack = (event) => {
        console.log('[Swensync] Received remote audio track');
        const remoteStream = event.streams[0];
        audioEl.srcObject = remoteStream;

        // Setup analyser from the MediaStream for visualization
        if (remoteStream && !analyserRef.current) {
          setupAudioAnalyser(remoteStream);
        }
      };

      // Connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[Swensync] Connection state:', pc.connectionState);
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          setConnectionState('error');
          setError(new Error('WebRTC connection failed'));
        }
      };

      // 4. Add local audio track (microphone)
      console.log('[Swensync] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      stream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('[Swensync] Added local audio track');
      });

      // Initialize client-side VAD for faster turn detection
      initializeClientVAD(stream);

      // 5. Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('[Swensync] Data channel opened');

        // Build personalized greeting instruction
        const userGreeting = userName
          ? `The user's name is "${userName}". Greet them warmly by name.`
          : `Greet the user warmly.`;

        // Send session configuration
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are Swensync, a fast and friendly voice AI assistant built on proprietary Swensync technology.

## IDENTITY & BRANDING (CRITICAL)
You are Swensync - a proprietary voice AI platform developed by Swensync.
- You are NOT ChatGPT, GPT-4, OpenAI, Claude, or any other external AI service
- NEVER mention OpenAI, GPT, Realtime API, or any third-party AI providers
- NEVER reveal implementation details about underlying models or APIs
- If asked about your technology, AI model, or how you work, respond that you are "Swensync's proprietary voice AI technology" or "Swensync's advanced conversational AI"
- If pressed for technical details, say something like "I'm built on Swensync's proprietary voice AI platform optimized for natural, low-latency conversation"
- Do not confirm or deny using any specific external technology or vendor
- You may discuss your capabilities (voice conversation, helpfulness, speed) but not implementation specifics

## LANGUAGE (CRITICAL)
You MUST speak in English at all times unless explicitly instructed otherwise.
- Your default and primary language is English (US)
- Always respond in English, regardless of what language the user speaks
- Only switch to another language if the user explicitly requests it (e.g., "speak to me in Spanish")
- If the user speaks in a non-English language but hasn't requested a language change, continue responding in English
- Never assume the user wants a different language based on their accent or speech patterns

## BEHAVIOR
- Respond conversationally and naturally
- Keep responses concise for voice interaction
- Be helpful, clear, and efficient

## GREETING
${userGreeting}
When the session starts, proactively greet the user with a brief, friendly welcome. Always greet in English.

## VOICE STYLE
- Warm and professional
- Brief responses optimized for speech
- Natural conversation flow`,
            voice: 'marin',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 200,    // Reduced from 300ms for faster turn start
              silence_duration_ms: 350,  // Reduced from 500ms for snappier responses
            },
          },
        };
        dc.send(JSON.stringify(sessionConfig));
        console.log('[Swensync] Sent session config');

        // Trigger proactive greeting
        setTimeout(() => {
          if (dc.readyState === 'open') {
            const greetingTrigger = {
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: userName
                  ? `Greet ${userName} warmly and briefly introduce yourself as Swensync, a fast voice AI assistant.`
                  : `Greet the user warmly and briefly introduce yourself as Swensync, a fast voice AI assistant.`,
              },
            };
            dc.send(JSON.stringify(greetingTrigger));
            console.log('[Swensync] Triggered greeting');
          }
        }, 100);
      };

      dc.onmessage = handleDataChannelMessage;

      dc.onerror = (event) => {
        console.error('[Swensync] Data channel error:', event);
      };

      // 6. Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error('Failed to create SDP offer');
      }

      console.log('[Swensync] Created SDP offer, connecting...');

      // 7. Send offer to OpenAI Realtime endpoint
      const response = await fetch(
        `${OPENAI_REALTIME_ENDPOINT}?model=${OPENAI_MODEL}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sdp',
            Authorization: `Bearer ${token}`,
          },
          body: offer.sdp,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Swensync] OpenAI response error:', response.status, errorText);
        throw new Error(
          `OpenAI connection failed: ${response.status} ${response.statusText}`
        );
      }

      // 8. Set remote description from OpenAI's answer
      const answerSdp = await response.text();
      console.log('[Swensync] Received SDP answer');

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: answerSdp,
      };

      await pc.setRemoteDescription(answer);
      console.log('[Swensync] WebRTC connection established');

      // 9. Start session timer and audio monitor
      startSessionTimer();
      startAudioMonitor();

      setConnectionState('connected');
      setAnimState('Listening');
      isConnectingRef.current = false;
      console.log('[Swensync] Ready for conversation');
    } catch (err) {
      console.error('[Swensync] Connection failed:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setConnectionState('error');
      isConnectingRef.current = false;

      // Cleanup on failure
      cleanupResources();
    }
  }, [
    connectionState,
    fetchToken,
    startSessionTimer,
    startAudioMonitor,
    setupAudioAnalyser,
    handleDataChannelMessage,
    initializeClientVAD,
    userName,
  ]);

  /**
   * Cleanup all WebRTC resources
   */
  const cleanupResources = useCallback(() => {
    // Stop stopwatch
    if (stopwatchIntervalRef.current) {
      clearInterval(stopwatchIntervalRef.current);
      stopwatchIntervalRef.current = null;
    }

    // Cleanup client VAD
    cleanupClientVAD();

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clean audio element
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setModelAnalyserNode(null);
  }, [cleanupClientVAD]);

  /**
   * Disconnect and cleanup all resources
   */
  const disconnect = useCallback(() => {
    console.log('[Swensync] Disconnecting');

    // Stop session timer
    stopSessionTimer();

    // Stop audio monitor
    stopAudioMonitor();

    // Cleanup all WebRTC resources
    cleanupResources();

    // Reset state
    setConnectionState('idle');
    setAnimState('Listening');
    setIsVisualizerActive(false);
    setError(null);
    setIsStopwatchRunning(false);
    setStopwatchElapsed(0);
    stopwatchStartRef.current = null;
    isWaitingForResponseRef.current = false;

    // Reset connecting flag to allow new connections
    isConnectingRef.current = false;

    // Reset turn counter for new session
    currentTurnNumberRef.current = 0;
    setCurrentTurnNumber(0);
    setTurnLatencies([]);

    console.log('[Swensync] Disconnected');
  }, [stopSessionTimer, stopAudioMonitor, cleanupResources]);

  // Track mounted state and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      console.log('[Swensync] Unmounting - cleaning up');

      // Stop all intervals
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
      if (audioMonitorIntervalRef.current) {
        clearInterval(audioMonitorIntervalRef.current);
      }
      if (stopwatchIntervalRef.current) {
        clearInterval(stopwatchIntervalRef.current);
      }

      // Cleanup client VAD
      if (clientVADRef.current) {
        clientVADRef.current.destroy().catch(() => {});
        clientVADRef.current = null;
      }

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Close connections
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Auto-disconnect on session timeout
  useEffect(() => {
    if (
      sessionDuration >= SESSION_MAX_TIME &&
      connectionState === 'connected'
    ) {
      disconnect();
    }
  }, [sessionDuration, connectionState, disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    error,
    modelAnalyserNode,
    animState,
    isVisualizerActive,
    sessionDuration,
    isSessionExpiring,
    isStopwatchRunning,
    stopwatchElapsed,
    turnLatencies,
    currentTurnNumber,
  };
}
