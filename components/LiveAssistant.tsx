import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Video, Activity, Loader2 } from 'lucide-react';

// Audio utils
const decode = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

const createBlob = (data: Float32Array) => {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  return {
    data: base64Data,
    mimeType: 'audio/pcm;rate=16000',
  };
};

export const LiveAssistant: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<any>(null); // Type 'any' for the session to avoid strict type mismatch with internal lib
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Video Streaming Interval
  const frameIntervalRef = useRef<number | null>(null);

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Request media permissions FIRST. If the user dismisses or denies, this throws immediately,
      // avoiding the creation of AudioContexts that can't be used.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Ensure contexts are running (some browsers suspend them by default)
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Live Session Opened");
            setIsConnected(true);

            // Setup Microphone Stream
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return; // Simple mute logic
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((s: any) => s.sendRealtimeInput({ media: pcmBlob }));
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current;
              if (ctx) {
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 const audioBuffer = await decodeAudioData(
                   decode(base64Audio),
                   ctx,
                   24000,
                   1
                 );
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputNode);
                 source.addEventListener('ended', () => {
                   sourcesRef.current.delete(source);
                 });
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
              }
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            setIsConnected(false);
            console.log("Live Session Closed");
          },
          onerror: (e) => {
             console.error("Live Session Error", e);
             setIsConnected(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: 'You are a creative director helping a user write a storyboard. Be enthusiastic, offer visual ideas, and ask clarifying questions about the plot.',
        },
      });

      sessionPromiseRef.current = sessionPromise;
      setSession(sessionPromise); // Storing promise essentially as session indicator

    } catch (err) {
      console.error("Failed to start session:", err);
      if ((err as any).name === 'NotAllowedError' || (err as any).name === 'PermissionDismissedError') {
          alert("Microphone permission was denied or dismissed. Please allow microphone access to use the Live Director.");
      } else {
          alert("Failed to connect to Gemini Live. Please check your connection and API key.");
      }
    }
  };

  const stopSession = () => {
    // There isn't a direct "close" on the session object in the new SDK easily accessible if we only have the promise,
    // but usually we can just close contexts and let the socket die or if the SDK exposes close on the resolved session.
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then((s: any) => {
            // Attempt to close if method exists
            if (typeof s.close === 'function') s.close();
        });
    }

    // Check state before closing to avoid "Cannot close a closed AudioContext"
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
    }
    
    setIsConnected(false);
    setSession(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-900 text-white rounded-xl border border-gray-800 shadow-2xl relative overflow-hidden">
      
      {/* Visualizer Background Effect */}
      <div className={`absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 transition-opacity duration-1000 ${isConnected ? 'opacity-100' : 'opacity-0'}`} />

      <div className="z-10 text-center space-y-8">
        <div className="relative">
          <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${isConnected ? 'border-green-400 shadow-[0_0_30px_rgba(74,222,128,0.5)] animate-pulse' : 'border-gray-600'}`}>
            <Activity className={`w-12 h-12 ${isConnected ? 'text-green-400' : 'text-gray-500'}`} />
          </div>
          {isConnected && (
            <span className="absolute -top-2 -right-2 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
            </span>
          )}
        </div>

        <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">AI Creative Director</h2>
            <p className="text-gray-400 max-w-md mx-auto">
                {isConnected 
                  ? "Listening... Discuss your scene ideas, character motivations, or ask for visual suggestions." 
                  : "Connect to the Live API to brainstorm your script with a real-time voice assistant."}
            </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          {!isConnected ? (
            <button
              onClick={startSession}
              className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-semibold text-lg transition-all transform hover:scale-105 shadow-lg"
            >
              <Mic className="w-5 h-5" />
              Start Session
            </button>
          ) : (
            <div className="flex gap-4">
                <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-4 rounded-full border-2 transition-colors ${isMuted ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-gray-800 border-gray-600 hover:bg-gray-700'}`}
                >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <button
                    onClick={stopSession}
                    className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-full font-semibold transition-all shadow-lg"
                >
                    End Session
                </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Hidden elements for potential video expansion */}
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};