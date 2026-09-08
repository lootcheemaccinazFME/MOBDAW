import React, { useState } from 'react';
import {
  Sliders,
  Power,
  Trash2,
  Plus,
  Activity,
  Layers,
  Sparkles,
  ChevronDown,
  HardDrive,
} from 'lucide-react';
import {
  Project,
  AnyEffectConfig,
  EQEffectConfig,
  CompressorEffectConfig,
  ReverbEffectConfig,
  DelayEffectConfig,
  DistortionEffectConfig,
  ChorusEffectConfig,
  BitcrusherEffectConfig,
  LimiterEffectConfig,
  EffectType,
} from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface EffectsRackViewProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  initialTrackId?: string;
  onOpenPCPlugins?: () => void;
}

export const EffectsRackView: React.FC<EffectsRackViewProps> = ({
  project,
  onUpdateProject,
  initialTrackId,
  onOpenPCPlugins,
}) => {
  const engine = AudioEngine.getInstance();
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    initialTrackId || project.tracks[0]?.id || 'master'
  );

  const isMaster = selectedTargetId === 'master';
  const currentTrack = project.tracks.find((t) => t.id === selectedTargetId);
  const effectsList = isMaster ? project.masterEffects : currentTrack?.effects || [];

  const handleToggleEffect = (index: number) => {
    onUpdateProject((prev) => {
      if (isMaster) {
        const updatedFx = [...prev.masterEffects];
        updatedFx[index] = { ...updatedFx[index], enabled: !updatedFx[index].enabled };
        const updated = { ...prev, masterEffects: updatedFx };
        engine.setupMasterEffects(updatedFx);
        return updated;
      } else {
        const updatedTracks = prev.tracks.map((t) => {
          if (t.id !== selectedTargetId) return t;
          const updatedFx = [...t.effects];
          updatedFx[index] = { ...updatedFx[index], enabled: !updatedFx[index].enabled };
          return { ...t, effects: updatedFx };
        });
        const updated = { ...prev, tracks: updatedTracks };
        engine.setProject(updated);
        return updated;
      }
    });
  };

  const handleDeleteEffect = (index: number) => {
    onUpdateProject((prev) => {
      if (isMaster) {
        const updatedFx = prev.masterEffects.filter((_, i) => i !== index);
        const updated = { ...prev, masterEffects: updatedFx };
        engine.setupMasterEffects(updatedFx);
        return updated;
      } else {
        const updatedTracks = prev.tracks.map((t) => {
          if (t.id !== selectedTargetId) return t;
          const updatedFx = t.effects.filter((_, i) => i !== index);
          return { ...t, effects: updatedFx };
        });
        const updated = { ...prev, tracks: updatedTracks };
        engine.setProject(updated);
        return updated;
      }
    });
  };

  const handleAddEffect = (type: EffectType) => {
    let newFx: AnyEffectConfig;
    switch (type) {
      case 'eq':
        newFx = {
          type: 'eq',
          enabled: true,
          lowGain: 0,
          lowFreq: 100,
          midGain: 0,
          midFreq: 1500,
          midQ: 1.0,
          highGain: 0,
          highFreq: 8000,
        };
        break;
      case 'compressor':
        newFx = {
          type: 'compressor',
          enabled: true,
          threshold: -16,
          ratio: 4,
          attack: 0.02,
          release: 0.15,
          makeupGain: 2,
        };
        break;
      case 'delay':
        newFx = {
          type: 'delay',
          enabled: true,
          time: 0.25,
          feedback: 0.4,
          pingPong: true,
          filterDamp: 3500,
          wet: 0.35,
        };
        break;
      case 'reverb':
        newFx = {
          type: 'reverb',
          enabled: true,
          decay: 2.5,
          roomSize: 0.8,
          damping: 0.3,
          wet: 0.4,
        };
        break;
      case 'distortion':
        newFx = {
          type: 'distortion',
          enabled: true,
          drive: 30,
          tone: 0.6,
          mode: 'soft',
          wet: 0.4,
        };
        break;
      case 'chorus':
        newFx = {
          type: 'chorus',
          enabled: true,
          rate: 1.5,
          depth: 0.5,
          feedback: 0.3,
          wet: 0.4,
        };
        break;
      case 'bitcrusher':
        newFx = {
          type: 'bitcrusher',
          enabled: true,
          bits: 8,
          downsample: 4,
          wet: 0.5,
        };
        break;
      case 'limiter':
        newFx = {
          type: 'limiter',
          enabled: true,
          ceiling: -0.2,
          release: 0.05,
        };
        break;
    }

    onUpdateProject((prev) => {
      if (isMaster) {
        const updatedFx = [...prev.masterEffects, newFx];
        const updated = { ...prev, masterEffects: updatedFx };
        engine.setupMasterEffects(updatedFx);
        return updated;
      } else {
        const updatedTracks = prev.tracks.map((t) => {
          if (t.id !== selectedTargetId) return t;
          return { ...t, effects: [...t.effects, newFx] };
        });
        const updated = { ...prev, tracks: updatedTracks };
        engine.setProject(updated);
        return updated;
      }
    });
  };

  const updateParam = (fxIndex: number, updater: (fx: AnyEffectConfig) => AnyEffectConfig) => {
    onUpdateProject((prev) => {
      if (isMaster) {
        const updatedFx = [...prev.masterEffects];
        updatedFx[fxIndex] = updater(updatedFx[fxIndex]);
        const updated = { ...prev, masterEffects: updatedFx };
        engine.setupMasterEffects(updatedFx);
        return updated;
      } else {
        const updatedTracks = prev.tracks.map((t) => {
          if (t.id !== selectedTargetId) return t;
          const updatedFx = [...t.effects];
          updatedFx[fxIndex] = updater(updatedFx[fxIndex]);
          return { ...t, effects: updatedFx };
        });
        const updated = { ...prev, tracks: updatedTracks };
        engine.setProject(updated);
        return updated;
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-200">
      {/* Top FX Selector Bar */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between gap-3 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-bold">FX RACK TARGET:</span>
          <select
            value={selectedTargetId}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 text-xs rounded px-2.5 py-1 text-cyan-300 font-bold focus:outline-none"
          >
            <option value="master">MASTER BUS</option>
            {project.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Add Effect Dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 font-bold uppercase">Add Plugin:</span>
          {(['eq', 'compressor', 'delay', 'reverb', 'distortion', 'chorus', 'bitcrusher', 'limiter'] as EffectType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleAddEffect(type)}
              className="px-2 py-1 bg-neutral-950 hover:bg-cyan-950 hover:text-cyan-300 border border-neutral-800 hover:border-cyan-800 rounded text-xs font-semibold uppercase transition cursor-pointer"
            >
              + {type}
            </button>
          ))}
          {onOpenPCPlugins && (
            <button
              id="effects-rack-open-pc-plugins-btn"
              onClick={onOpenPCPlugins}
              className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-600/50 rounded text-xs font-bold transition cursor-pointer ml-1"
              title="Add or Manage PC Plugins (VST3, CLAP, DLL)"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>+ PC Plugin...</span>
            </button>
          )}
        </div>
      </div>

      {/* Effects Rack Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {effectsList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 py-12">
            <Sliders className="w-12 h-12 stroke-[1.2] mb-2 text-neutral-700" />
            <p className="text-sm font-semibold">No insert effects on this channel.</p>
            <p className="text-xs text-neutral-600 mt-1">
              Select an effect above to add it to the DSP chain.
            </p>
          </div>
        ) : (
          effectsList.map((fx, idx) => (
            <div
              key={idx}
              className={`border rounded-xl p-4 transition shadow-lg ${
                fx.enabled
                  ? 'bg-neutral-900/90 border-neutral-700/80 shadow-cyan-950/20'
                  : 'bg-neutral-950/80 border-neutral-800/80 opacity-60'
              }`}
            >
              {/* Module Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80 mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEffect(idx)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      fx.enabled
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                        : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                    }`}
                    title="Bypass / Enable Effect"
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-100 uppercase tracking-wide">
                      {fx.type === 'eq' && 'Parametric 3-Band EQ'}
                      {fx.type === 'compressor' && 'Dynamics Compressor'}
                      {fx.type === 'delay' && 'Stereo Tape Delay'}
                      {fx.type === 'reverb' && 'Algorithmic Hall Reverb'}
                      {fx.type === 'distortion' && 'Harmonic Tube Saturator'}
                      {fx.type === 'chorus' && 'Analog Chorus / Flanger'}
                      {fx.type === 'bitcrusher' && 'Lo-Fi Bitcrusher & Decimator'}
                      {fx.type === 'limiter' && 'Brickwall Peak Limiter'}
                    </h4>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      DSP Insert {idx + 1}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteEffect(idx)}
                  className="p-1.5 text-neutral-500 hover:text-rose-400 rounded transition cursor-pointer"
                  title="Remove from Rack"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Effect Controls Specific to Type */}

              {/* 1. EQ */}
              {fx.type === 'eq' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Low */}
                  <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-2">
                    <span className="text-xs font-bold text-cyan-400">LOW SHELF</span>
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Gain:</span>
                      <span className="font-mono">{fx.lowGain} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-18"
                      max="18"
                      step="0.5"
                      value={fx.lowGain}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as EQEffectConfig),
                          lowGain: parseFloat(e.target.value),
                        }))
                      }
                      className="accent-cyan-400"
                    />
                  </div>

                  {/* Mid */}
                  <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-2">
                    <span className="text-xs font-bold text-cyan-400">MID PEAK</span>
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Gain:</span>
                      <span className="font-mono">{fx.midGain} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-18"
                      max="18"
                      step="0.5"
                      value={fx.midGain}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as EQEffectConfig),
                          midGain: parseFloat(e.target.value),
                        }))
                      }
                      className="accent-cyan-400"
                    />
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Freq:</span>
                      <span className="font-mono">{fx.midFreq} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="5000"
                      step="50"
                      value={fx.midFreq}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as EQEffectConfig),
                          midFreq: parseFloat(e.target.value),
                        }))
                      }
                      className="accent-cyan-400"
                    />
                  </div>

                  {/* High */}
                  <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 flex flex-col gap-2">
                    <span className="text-xs font-bold text-cyan-400">HIGH SHELF</span>
                    <div className="flex justify-between text-[11px] text-neutral-400">
                      <span>Gain:</span>
                      <span className="font-mono">{fx.highGain} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-18"
                      max="18"
                      step="0.5"
                      value={fx.highGain}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as EQEffectConfig),
                          highGain: parseFloat(e.target.value),
                        }))
                      }
                      className="accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* 2. Compressor */}
              {fx.type === 'compressor' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Threshold:</span>
                      <span className="font-mono text-cyan-400">{fx.threshold} dB</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="0"
                      value={fx.threshold}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as CompressorEffectConfig),
                          threshold: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Ratio:</span>
                      <span className="font-mono text-cyan-400">{fx.ratio}:1</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="0.5"
                      value={fx.ratio}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as CompressorEffectConfig),
                          ratio: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Attack:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.attack * 1000)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.001"
                      max="0.2"
                      step="0.005"
                      value={fx.attack}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as CompressorEffectConfig),
                          attack: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Makeup:</span>
                      <span className="font-mono text-cyan-400">+{fx.makeupGain} dB</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      step="0.5"
                      value={fx.makeupGain}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as CompressorEffectConfig),
                          makeupGain: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* 3. Delay */}
              {fx.type === 'delay' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Time:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.time * 1000)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.01"
                      value={fx.time}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DelayEffectConfig),
                          time: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Feedback:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.feedback * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.9"
                      step="0.02"
                      value={fx.feedback}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DelayEffectConfig),
                          feedback: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Filter Damp:</span>
                      <span className="font-mono text-cyan-400">{fx.filterDamp} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="10000"
                      step="100"
                      value={fx.filterDamp}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DelayEffectConfig),
                          filterDamp: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Wet Mix:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.wet * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={fx.wet}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DelayEffectConfig),
                          wet: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* 4. Reverb */}
              {fx.type === 'reverb' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Decay Time:</span>
                      <span className="font-mono text-cyan-400">{fx.decay}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="8"
                      step="0.1"
                      value={fx.decay}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as ReverbEffectConfig),
                          decay: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Room Size:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.roomSize * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={fx.roomSize}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as ReverbEffectConfig),
                          roomSize: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Damping:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.damping * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      value={fx.damping}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as ReverbEffectConfig),
                          damping: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Wet:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.wet * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.02"
                      value={fx.wet}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as ReverbEffectConfig),
                          wet: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* 5. Distortion */}
              {fx.type === 'distortion' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Drive:</span>
                      <span className="font-mono text-rose-400">{fx.drive}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={fx.drive}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DistortionEffectConfig),
                          drive: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-rose-500"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Wet Mix:</span>
                      <span className="font-mono text-rose-400">{Math.round(fx.wet * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={fx.wet}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as DistortionEffectConfig),
                          wet: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-rose-500"
                    />
                  </div>
                </div>
              )}

              {/* 6. Limiter */}
              {fx.type === 'limiter' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Ceiling:</span>
                      <span className="font-mono text-cyan-400">{fx.ceiling} dBFS</span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="0"
                      step="0.1"
                      value={fx.ceiling}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as LimiterEffectConfig),
                          ceiling: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-neutral-400">Release:</span>
                      <span className="font-mono text-cyan-400">{Math.round(fx.release * 1000)}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.5"
                      step="0.01"
                      value={fx.release}
                      onChange={(e) =>
                        updateParam(idx, (old) => ({
                          ...(old as LimiterEffectConfig),
                          release: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
