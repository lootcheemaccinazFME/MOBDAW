import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Play,
  RotateCcw,
  Check,
  X,
  Volume2,
  Sliders,
} from 'lucide-react';
import { Project, Track, TrackClip } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface AudioRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  currentBeat: number;
}

export const AudioRecorderModal: React.FC<AudioRecorderModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  currentBeat,
}) => {
  const engine = AudioEngine.getInstance();
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    project.tracks.find((t) => t.type === 'audio')?.id || project.tracks[0]?.id || ''
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      // Web Audio analyser for waveform drawing
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const drawWaveform = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        analyser.getByteTimeDomainData(dataArray);

        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#06b6d4';
        ctx.beginPath();

        const sliceWidth = (canvas.width * 1.0) / dataArray.length;
        let x = 0;

        let maxVal = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          const level = Math.abs(dataArray[i] - 128) / 128;
          if (level > maxVal) maxVal = level;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        setInputLevel(maxVal);
        animationFrameRef.current = requestAnimationFrame(drawWaveform);
      };

      drawWaveform();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setRecordedBlob(audioBlob);
        setRecordedAudioUrl(url);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDurationSec(0);

      timerRef.current = window.setInterval(() => {
        setRecordingDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting audio recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleSaveToTrack = () => {
    if (!recordedAudioUrl) return;

    const beatsDuration = Math.max(1, Math.round((recordingDurationSec * (project.settings.bpm / 60))));

    const newClip: TrackClip = {
      id: 'audio_rec_' + Date.now(),
      name: `Vocal Take ${recordingDurationSec}s`,
      type: 'audio',
      startBeat: Math.round(currentBeat),
      durationBeats: beatsDuration,
      audioBufferId: recordedAudioUrl,
    };

    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        return { ...t, clips: [...t.clips, newClip] };
      });
      return { ...prev, tracks: updatedTracks };
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-rose-500" />
            <h3 className="font-bold text-base text-white">Audio & Vocal Tracking</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Track */}
        <div className="flex items-center justify-between text-xs bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
          <span className="text-neutral-400 font-medium">Record into Track:</span>
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="bg-neutral-900 border border-neutral-700 text-cyan-300 font-bold rounded px-2 py-1 focus:outline-none"
          >
            {project.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Live Audio Oscilloscope Canvas */}
        <div className="h-32 bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden relative flex items-center justify-center shadow-inner">
          <canvas ref={canvasRef} width={460} height={128} className="w-full h-full" />

          {!isRecording && !recordedAudioUrl && (
            <div className="absolute text-center text-neutral-500 text-xs">
              Press Record to begin live microphone input capture
            </div>
          )}

          {/* Live dB meter bar on right */}
          <div className="absolute right-2 top-2 bottom-2 w-2 bg-neutral-900 rounded-full overflow-hidden flex flex-col justify-end">
            <div
              className="w-full bg-cyan-400 transition-all duration-75"
              style={{ height: `${inputLevel * 100}%` }}
            />
          </div>
        </div>

        {/* Recording Stats */}
        <div className="flex items-center justify-between px-2 text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRecording ? 'bg-rose-500 animate-ping' : 'bg-neutral-700'
              }`}
            />
            <span>{isRecording ? 'RECORDING' : 'IDLE'}</span>
          </div>
          <span className="text-sm font-bold text-white">
            {Math.floor(recordingDurationSec / 60)}:
            {(recordingDurationSec % 60).toString().padStart(2, '0')}
          </span>
        </div>

        {/* Preview Player if recorded */}
        {recordedAudioUrl && (
          <div className="bg-neutral-950 p-3 rounded-lg border border-cyan-800/40 flex items-center justify-between gap-3">
            <span className="text-xs text-neutral-300 font-semibold truncate">
              Take ready: {recordingDurationSec}s
            </span>
            <audio src={recordedAudioUrl} controls className="h-8 max-w-[240px]" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30 cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>Record</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold transition cursor-pointer border border-neutral-700"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </button>
          )}

          {recordedAudioUrl && (
            <button
              onClick={handleSaveToTrack}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Insert Take into Track</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
