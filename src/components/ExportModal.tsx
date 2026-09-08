import React, { useState } from 'react';
import {
  Download,
  X,
  FileAudio,
  CheckCircle,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Project } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const engine = AudioEngine.getInstance();
  const [format, setFormat] = useState<'wav' | 'flac' | 'mp3'>('wav');
  const [bitDepth, setBitDepth] = useState<16 | 24>(24);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  // Convert an AudioBuffer into a WAV Blob
  const audioBufferToWavBlob = (buffer: AudioBuffer, bitDepth: 16 | 24): Blob => {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels * (bitDepth / 8);
    const bufferData = new ArrayBuffer(44 + length);
    const view = new DataView(bufferData);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');

    // FMT sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * numChannels * (bitDepth / 8), true); // ByteRate
    view.setUint16(32, numChannels * (bitDepth / 8), true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample

    // Data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Interleave channels & write PCM samples
    let offset = 44;
    const left = buffer.getChannelData(0);
    const right = numChannels > 1 ? buffer.getChannelData(1) : left;

    for (let i = 0; i < buffer.length; i++) {
      // Left channel
      let sampleL = Math.max(-1, Math.min(1, left[i]));
      if (bitDepth === 16) {
        view.setInt16(offset, sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff, true);
        offset += 2;
      } else {
        let val = Math.floor(sampleL < 0 ? sampleL * 0x800000 : sampleL * 0x7fffff);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }

      // Right channel
      let sampleR = Math.max(-1, Math.min(1, right[i]));
      if (bitDepth === 16) {
        view.setInt16(offset, sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff, true);
        offset += 2;
      } else {
        let val = Math.floor(sampleR < 0 ? sampleR * 0x800000 : sampleR * 0x7fffff);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(15);

    try {
      // Total bars * 4 beats * (60 / bpm)
      const durationSeconds = (32 * 60) / project.settings.bpm; // 8 bars
      const offlineCtx = new OfflineAudioContext(2, sampleRate * durationSeconds, sampleRate);

      setProgress(40);

      // Render drum pattern onto offline context
      const drumPattern = project.drumPatterns[0];
      const secondsPerBeat = 60 / project.settings.bpm;
      const secondsPerStep = secondsPerBeat / 4;

      if (drumPattern) {
        const repetitions = Math.ceil(32 / (drumPattern.stepCount / 4));
        for (let rep = 0; rep < repetitions; rep++) {
          const repStartSec = rep * drumPattern.stepCount * secondsPerStep;
          drumPattern.lanes.forEach((lane) => {
            lane.steps.forEach((step, sIdx) => {
              if (step.active) {
                const stepTime = repStartSec + sIdx * secondsPerStep;
                if (stepTime < durationSeconds) {
                  engine.playDrumSample(lane.sampleId, step.velocity / 127, stepTime, offlineCtx.destination);
                }
              }
            });
          });
        }
      }

      setProgress(70);

      // Render synth notes onto offline context
      project.tracks.forEach((track) => {
        if (!track.synthConfig || track.mute) return;
        track.clips.forEach((clip) => {
          if (clip.type === 'midi' && clip.midiNotes) {
            clip.midiNotes.forEach((note) => {
              const noteStartSec = (clip.startBeat + note.startTime) * secondsPerBeat;
              const noteDurationSec = note.duration * secondsPerBeat;
              if (noteStartSec < durationSeconds) {
                engine.playSynthNote(
                  track.synthConfig!,
                  note.pitch,
                  note.velocity / 127,
                  noteStartSec,
                  noteDurationSec,
                  offlineCtx.destination
                );
              }
            });
          }
        });
      });

      setProgress(85);

      const renderedBuffer = await offlineCtx.startRendering();
      setProgress(95);

      const wavBlob = audioBufferToWavBlob(renderedBuffer, bitDepth);
      const url = URL.createObjectURL(wavBlob);
      setDownloadUrl(url);
      setProgress(100);
      setIsExporting(false);

      // Trigger auto-download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '_')}_Mixdown.${format}`;
      a.click();
    } catch (err) {
      console.error('Export error:', err);
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-base text-white">Export & Master Mixdown</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selectors */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-xs font-bold text-neutral-400 block mb-1">AUDIO FORMAT:</span>
            <div className="grid grid-cols-3 gap-2">
              {(['wav', 'flac', 'mp3'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`py-2 rounded-lg text-xs font-bold uppercase border transition cursor-pointer ${
                    format === fmt
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-bold text-neutral-400 block mb-1">BIT DEPTH:</span>
              <select
                value={bitDepth}
                onChange={(e) => setBitDepth(parseInt(e.target.value) as 16 | 24)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-neutral-200 font-bold focus:outline-none"
              >
                <option value={24}>24-Bit Studio Master</option>
                <option value={16}>16-Bit CD Quality</option>
              </select>
            </div>

            <div>
              <span className="text-xs font-bold text-neutral-400 block mb-1">SAMPLE RATE:</span>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(parseInt(e.target.value))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-neutral-200 font-bold focus:outline-none"
              >
                <option value={48000}>48.0 kHz</option>
                <option value={44100}>44.1 kHz</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mixdown Specs */}
        <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-400 flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Arrangement Length:</span>
            <span className="text-cyan-400">8 Bars (32 Beats)</span>
          </div>
          <div className="flex justify-between">
            <span>Project Tempo:</span>
            <span className="text-cyan-400">{project.settings.bpm} BPM</span>
          </div>
          <div className="flex justify-between">
            <span>Channel Master:</span>
            <span className="text-emerald-400">Stereo Interleaved WAV</span>
          </div>
        </div>

        {/* Progress Bar */}
        {isExporting && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-mono text-neutral-400">
              <span>Rendering DSP Mixdown...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Download ready button */}
        {downloadUrl && !isExporting && (
          <div className="flex items-center gap-2 p-2 bg-emerald-950/40 border border-emerald-800/40 rounded-lg text-emerald-400 text-xs font-semibold">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Mixdown rendered & downloaded successfully!</span>
          </div>
        )}

        {/* Export Button */}
        <button
          onClick={handleStartExport}
          disabled={isExporting}
          className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-neutral-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition cursor-pointer disabled:opacity-50"
        >
          {isExporting ? 'Bouncing Offline Audio...' : 'Start Audio Bounce & Export'}
        </button>
      </div>
    </div>
  );
};
