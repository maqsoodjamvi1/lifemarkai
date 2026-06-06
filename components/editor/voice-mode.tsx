"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Square, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface VoiceModeProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type VoiceState = "idle" | "recording" | "processing";

export function VoiceMode({ onTranscript, disabled }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [volume, setVolume] = useState(0);
  const [duration, setDuration] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => () => {
    stopAll();
  }, []);

  function stopAll() {
    mediaRef.current?.stop();
    timerRef.current && clearInterval(timerRef.current);
    animFrameRef.current && cancelAnimationFrame(animFrameRef.current);
  }

  async function startRecording() {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up volume analyser
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      function updateVolume() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(avg / 128);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      }
      updateVolume();

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        cancelAnimationFrame(animFrameRef.current!);
        processAudio();
      };
      recorder.start(100);
      mediaRef.current = recorder;
      setState("recording");
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= 60) { stopRecording(); return d; } // Max 60s
          return d + 1;
        });
      }, 1000);
    } catch {
      toast({ title: "Microphone access denied", description: "Please allow microphone access to use Voice Mode.", variant: "destructive" });
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
    }
    timerRef.current && clearInterval(timerRef.current);
    setState("processing");
    setVolume(0);
  }

  async function processAudio() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("file", blob, "recording.webm");
    formData.append("model", "whisper-1");

    try {
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      if (data.text) {
        onTranscript(data.text);
        toast({ title: "Transcribed!", description: `"${data.text.slice(0, 60)}..."` });
      } else {
        toast({ title: "No speech detected", variant: "destructive" });
      }
    } catch {
      toast({ title: "Transcription failed", variant: "destructive" });
    } finally {
      setState("idle");
      setDuration(0);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`w-8 h-8 transition-colors ${
          state === "recording" ? "text-red-400 bg-red-500/10 hover:bg-red-500/20" :
          state === "processing" ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={state === "idle" ? startRecording : state === "recording" ? stopRecording : undefined}
        disabled={disabled || state === "processing"}
      >
        {state === "processing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === "recording" ? (
          <Square className="w-3.5 h-3.5" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>

      {/* Recording indicator */}
      <AnimatePresence>
        {state === "recording" && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-card border border-border rounded-xl p-3 shadow-xl w-48 z-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-400">Recording</span>
              <span className="text-xs text-muted-foreground ml-auto">{duration}s</span>
            </div>

            {/* Waveform visualization */}
            <div className="flex items-end justify-center gap-0.5 h-8">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-red-400 rounded-full"
                  animate={{
                    height: `${Math.max(4, volume * 32 * (0.5 + Math.sin(Date.now() / 100 + i) * 0.5))}px`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center mt-2">
              Click stop or press again
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
