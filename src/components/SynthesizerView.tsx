import React, { useState } from 'react';
import {
  Sliders,
  Activity,
  AudioWaveform,
  Sparkles,
  Zap,
  Volume2,
} from 'lucide-react';
import { Project, SynthConfig } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';
import { SYNTH_PRESETS } from '../data/defaultProject';

interface SynthesizerViewProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  initialTrackId?: string;
}

export const SynthesizerView: React.FC<SynthesizerViewProps> = ({
  project,
  onUpdateProject,
  initialTrackId,
}) => {
  const engine = AudioEngine.getInstance();

  const synthTracks = project.tracks.filter((t) => t.synthConfig);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || synthTracks[0]?.id || project.tracks[0]?.id || ''
  );

  const activeTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const synthConfig = activeTrack?.synthConfig;

  // Active keyboard octave
  const [baseOctave, setBaseOctave] = useState<number>(4);

  if (!activeTrack || !synthConfig) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-neutral-400">
        No synthesizer track selected.
      </div>
    );
  }

  const updateSynth = (updater: (prev: SynthConfig) => SynthConfig) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId || !t.synthConfig) return t;
        return { ...t, synthConfig: updater(t.synthConfig) };
      });
      const updated = { ...prev, tracks: updatedTracks };
      engine.setProject(updated);
      return updated;
    });
  };

  const applyPreset = (presetKey: keyof typeof SYNTH_PRESETS) => {
    const preset = SYNTH_PRESETS[presetKey];
    if (!preset) return;
    updateSynth(() => JSON.parse(JSON.stringify(preset)));
  };

  // Trigger synth note with Web Audio
  const triggerKey = (pitch: number) => {
    if (synthConfig) {
      engine.previewSynthNote(synthConfig, pitch, 0.85, 0.4);
    }
  };

  const keys = [
    { note: 'C', offset: 0, black: false },
    { note: 'C#', offset: 1, black: true },
    { note: 'D', offset: 2, black: false },
    { note: 'D#', offset: 3, black: true },
    { note: 'E', offset: 4, black: false },
    { note: 'F', offset: 5, black: false },
    { note: 'F#', offset: 6, black: true },
    { note: 'G', offset: 7, black: false },
    { note: 'G#', offset: 8, black: true },
    { note: 'A', offset: 9, black: false },
    { note: 'A#', offset: 10, black: true },
    { note: 'B', offset: 11, black: false },
    { note: 'C', offset: 12, black: false },
  ];

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-200">
      {/* Top Synth Header */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between gap-3 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-bold">SYNTH TRACK:</span>
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 text-xs rounded px-2.5 py-1 text-cyan-300 font-bold focus:outline-none"
          >
            {synthTracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Factory Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-bold uppercase">Sound Presets:</span>
          {Object.keys(SYNTH_PRESETS).map((key) => (
            <button
              key={key}
              onClick={() => applyPreset(key as keyof typeof SYNTH_PRESETS)}
              className="px-2 py-1 bg-neutral-950 hover:bg-cyan-950 hover:text-cyan-300 border border-neutral-800 hover:border-cyan-800 rounded text-xs font-semibold capitalize transition cursor-pointer"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Main Synth Parameters Layout */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* OSCILLATOR 1 */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-xs font-bold text-cyan-400 uppercase">Oscillator 1</span>
            <span className="text-[10px] text-neutral-500 font-mono">Primary</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400">Waveform:</span>
            <div className="grid grid-cols-4 gap-1">
              {(['sawtooth', 'square', 'sine', 'triangle'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() =>
                    updateSynth((s) => ({
                      ...s,
                      osc1: { ...s.osc1, type: w },
                    }))
                  }
                  className={`py-1 text-[10px] uppercase font-bold rounded border transition ${
                    synthConfig.osc1.type === w
                      ? 'bg-cyan-500 text-neutral-950 border-cyan-400 font-black'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {w.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Octave:</span>
            <span className="font-mono text-cyan-400">{synthConfig.osc1.octave}</span>
          </div>
          <input
            type="range"
            min="-2"
            max="2"
            step="1"
            value={synthConfig.osc1.octave}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                osc1: { ...s.osc1, octave: parseInt(e.target.value) },
              }))
            }
            className="accent-cyan-400"
          />

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Detune (cents):</span>
            <span className="font-mono text-cyan-400">{synthConfig.osc1.detune}</span>
          </div>
          <input
            type="range"
            min="-50"
            max="50"
            step="1"
            value={synthConfig.osc1.detune}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                osc1: { ...s.osc1, detune: parseInt(e.target.value) },
              }))
            }
            className="accent-cyan-400"
          />
        </div>

        {/* OSCILLATOR 2 & MIX */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-xs font-bold text-cyan-400 uppercase">Oscillator 2</span>
            <span className="text-[10px] text-neutral-500 font-mono">Secondary</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-neutral-400">Waveform:</span>
            <div className="grid grid-cols-4 gap-1">
              {(['sawtooth', 'square', 'sine', 'triangle'] as const).map((w) => (
                <button
                  key={w}
                  onClick={() =>
                    updateSynth((s) => ({
                      ...s,
                      osc2: { ...s.osc2, type: w },
                    }))
                  }
                  className={`py-1 text-[10px] uppercase font-bold rounded border transition ${
                    synthConfig.osc2.type === w
                      ? 'bg-cyan-500 text-neutral-950 border-cyan-400 font-black'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {w.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Semitone Pitch:</span>
            <span className="font-mono text-cyan-400">+{synthConfig.osc2.semitone}</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={synthConfig.osc2.semitone}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                osc2: { ...s.osc2, semitone: parseInt(e.target.value) },
              }))
            }
            className="accent-cyan-400"
          />

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Osc 1/2 Balance:</span>
            <span className="font-mono text-cyan-400">{Math.round(synthConfig.mix * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={synthConfig.mix}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                mix: parseFloat(e.target.value),
              }))
            }
            className="accent-cyan-400"
          />
        </div>

        {/* 24dB ANALOG FILTER */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-xs font-bold text-rose-400 uppercase">State-Variable Filter</span>
            <span className="text-[10px] text-neutral-500 font-mono">24dB/Oct</span>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Cutoff:</span>
            <span className="font-mono text-rose-400">{synthConfig.filter.cutoff} Hz</span>
          </div>
          <input
            type="range"
            min="100"
            max="16000"
            step="100"
            value={synthConfig.filter.cutoff}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                filter: { ...s.filter, cutoff: parseFloat(e.target.value) },
              }))
            }
            className="accent-rose-500"
          />

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Resonance (Q):</span>
            <span className="font-mono text-rose-400">{synthConfig.filter.resonance}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="15"
            step="0.2"
            value={synthConfig.filter.resonance}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                filter: { ...s.filter, resonance: parseFloat(e.target.value) },
              }))
            }
            className="accent-rose-500"
          />

          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">Envelope Mod:</span>
            <span className="font-mono text-rose-400">{Math.round(synthConfig.filter.envAmount * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={synthConfig.filter.envAmount}
            onChange={(e) =>
              updateSynth((s) => ({
                ...s,
                filter: { ...s.filter, envAmount: parseFloat(e.target.value) },
              }))
            }
            className="accent-rose-500"
          />
        </div>

        {/* AMPLITUDE ADSR ENVELOPE */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-xs font-bold text-amber-400 uppercase">Amp Envelope</span>
            <span className="text-[10px] text-neutral-500 font-mono">ADSR</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center">
            {/* Attack */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-neutral-400 font-bold">ATTACK</span>
              <input
                type="range"
                min="0.005"
                max="2"
                step="0.01"
                value={synthConfig.ampEnv.attack}
                onChange={(e) =>
                  updateSynth((s) => ({
                    ...s,
                    ampEnv: { ...s.ampEnv, attack: parseFloat(e.target.value) },
                  }))
                }
                className="h-20 -rotate-90 w-20 accent-amber-400 my-4"
              />
              <span className="text-[8px] font-mono text-amber-400">
                {Math.round(synthConfig.ampEnv.attack * 1000)}ms
              </span>
            </div>

            {/* Decay */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-neutral-400 font-bold">DECAY</span>
              <input
                type="range"
                min="0.05"
                max="3"
                step="0.05"
                value={synthConfig.ampEnv.decay}
                onChange={(e) =>
                  updateSynth((s) => ({
                    ...s,
                    ampEnv: { ...s.ampEnv, decay: parseFloat(e.target.value) },
                  }))
                }
                className="h-20 -rotate-90 w-20 accent-amber-400 my-4"
              />
              <span className="text-[8px] font-mono text-amber-400">
                {Math.round(synthConfig.ampEnv.decay * 1000)}ms
              </span>
            </div>

            {/* Sustain */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-neutral-400 font-bold">SUSTAIN</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={synthConfig.ampEnv.sustain}
                onChange={(e) =>
                  updateSynth((s) => ({
                    ...s,
                    ampEnv: { ...s.ampEnv, sustain: parseFloat(e.target.value) },
                  }))
                }
                className="h-20 -rotate-90 w-20 accent-amber-400 my-4"
              />
              <span className="text-[8px] font-mono text-amber-400">
                {Math.round(synthConfig.ampEnv.sustain * 100)}%
              </span>
            </div>

            {/* Release */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] text-neutral-400 font-bold">RELEASE</span>
              <input
                type="range"
                min="0.05"
                max="4"
                step="0.05"
                value={synthConfig.ampEnv.release}
                onChange={(e) =>
                  updateSynth((s) => ({
                    ...s,
                    ampEnv: { ...s.ampEnv, release: parseFloat(e.target.value) },
                  }))
                }
                className="h-20 -rotate-90 w-20 accent-amber-400 my-4"
              />
              <span className="text-[8px] font-mono text-amber-400">
                {Math.round(synthConfig.ampEnv.release * 1000)}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Touch Keyboard on Bottom */}
      <div className="h-32 bg-neutral-900 border-t border-neutral-800 flex flex-col shrink-0 p-2 select-none">
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1 px-1">
          <div className="flex items-center gap-2">
            <span className="font-bold">OCTAVE:</span>
            <button
              onClick={() => setBaseOctave((o) => Math.max(1, o - 1))}
              className="px-2 py-0.5 bg-neutral-800 rounded font-bold hover:bg-neutral-700 cursor-pointer"
            >
              -
            </button>
            <span className="font-mono text-cyan-400 font-bold">C{baseOctave}</span>
            <button
              onClick={() => setBaseOctave((o) => Math.min(7, o + 1))}
              className="px-2 py-0.5 bg-neutral-800 rounded font-bold hover:bg-neutral-700 cursor-pointer"
            >
              +
            </button>
          </div>
          <span className="text-neutral-500">Tap or click keys to play sound live</span>
        </div>

        {/* Keyboard keys */}
        <div className="flex-1 flex gap-1 relative">
          {keys.map((k, idx) => {
            const pitch = (baseOctave + 1) * 12 + k.offset;
            return (
              <button
                key={idx}
                onMouseDown={() => triggerKey(pitch)}
                className={`flex-1 rounded-b-md border transition cursor-pointer flex flex-col justify-end items-center pb-2 text-xs font-bold active:scale-95 shadow ${
                  k.black
                    ? 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800 h-20 -mx-2 z-10'
                    : 'bg-neutral-200 border-neutral-300 text-neutral-900 hover:bg-white h-24'
                }`}
              >
                <span>{k.note}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
