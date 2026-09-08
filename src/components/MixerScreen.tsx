import React, { useEffect, useState } from 'react';
import {
  Volume2,
  Sliders,
  Sparkles,
  Layers,
  Mic,
  Activity,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Project, Track, AnyEffectConfig } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface MixerScreenProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  onSelectTrackForFx: (trackId: string) => void;
}

export const MixerScreen: React.FC<MixerScreenProps> = ({
  project,
  onUpdateProject,
  onSelectTrackForFx,
}) => {
  const engine = AudioEngine.getInstance();
  const [trackMeters, setTrackMeters] = useState<{ [id: string]: { left: number; right: number; peakDb: number } }>({});
  const [masterMeter, setMasterMeter] = useState({ left: 0, right: 0, peakDb: -60 });

  useEffect(() => {
    const interval = setInterval(() => {
      const meters: { [id: string]: { left: number; right: number; peakDb: number } } = {};
      project.tracks.forEach((t) => {
        meters[t.id] = engine.getTrackMeter(t.id);
      });
      setTrackMeters(meters);
      setMasterMeter(engine.getMasterMeter());
    }, 60);

    return () => clearInterval(interval);
  }, [engine, project.tracks]);

  const handleVolumeChange = (trackId: string, val: number) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) =>
        t.id === trackId ? { ...t, volume: val } : t
      );
      const target = updatedTracks.find((t) => t.id === trackId);
      if (target) {
        engine.updateTrackControls(trackId, val, target.pan, target.mute);
      }
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handlePanChange = (trackId: string, val: number) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) =>
        t.id === trackId ? { ...t, pan: val } : t
      );
      const target = updatedTracks.find((t) => t.id === trackId);
      if (target) {
        engine.updateTrackControls(trackId, target.volume, val, target.mute);
      }
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleMute = (trackId: string) => {
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) =>
        t.id === trackId ? { ...t, mute: !t.mute } : t
      );
      const updated = { ...prev, tracks: updatedTracks };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleSolo = (trackId: string) => {
    onUpdateProject((prev) => {
      const isSoloed = prev.tracks.find((t) => t.id === trackId)?.solo;
      const updatedTracks = prev.tracks.map((t) => {
        if (isSoloed) {
          return { ...t, solo: false, mute: false };
        } else {
          return {
            ...t,
            solo: t.id === trackId,
            mute: t.id !== trackId,
          };
        }
      });
      const updated = { ...prev, tracks: updatedTracks };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleMasterVolume = (val: number) => {
    onUpdateProject((prev) => {
      const updated = {
        ...prev,
        settings: { ...prev.settings, masterVolume: val },
      };
      engine.updateMasterVolume(val);
      return updated;
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-200">
      {/* Top Mixer Info Bar */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between text-xs text-neutral-400 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-neutral-200">AURA CONSOLE MIXER</span>
          <span className="text-neutral-600">|</span>
          <span>{project.tracks.length} Channels Active</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span>Headroom: +3.0 dBFS</span>
          <span className="text-emerald-400">32-Bit Float Internal Bus</span>
        </div>
      </div>

      {/* Main Channel Strips Horizontal Scroll Area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 flex gap-3 items-stretch">
        {/* Track Channel Strips */}
        {project.tracks.map((track, idx) => {
          const meter = trackMeters[track.id] || { left: 0, right: 0, peakDb: -60 };
          const volDb = track.volume === 0 ? '-inf' : Math.round(20 * Math.log10(track.volume) * 10) / 10;

          return (
            <div
              key={track.id}
              className="w-40 bg-neutral-900/90 border border-neutral-800 rounded-xl flex flex-col justify-between p-2.5 shadow-lg shrink-0 hover:border-neutral-700 transition"
              style={{ borderTop: `4px solid ${track.color}` }}
            >
              {/* Channel Header */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-neutral-500">
                    CH {idx + 1}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: track.color }}
                  />
                </div>
                <div className="font-bold text-xs text-neutral-200 truncate" title={track.name}>
                  {track.name}
                </div>
              </div>

              {/* Insert FX Slots Summary */}
              <div className="my-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-800/80">
                <div className="flex items-center justify-between text-[9px] text-neutral-500 font-bold uppercase mb-1">
                  <span>Inserts ({track.effects.length})</span>
                  <button
                    onClick={() => onSelectTrackForFx(track.id)}
                    className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    title="Open FX Rack"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 max-h-16 overflow-hidden">
                  {track.effects.length === 0 ? (
                    <span className="text-[9px] text-neutral-600 italic">Empty Slot</span>
                  ) : (
                    track.effects.slice(0, 3).map((fx, i) => (
                      <button
                        key={i}
                        onClick={() => onSelectTrackForFx(track.id)}
                        className={`text-[9px] text-left px-1 py-0.5 rounded truncate font-medium ${
                          fx.enabled
                            ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/40'
                            : 'bg-neutral-900 text-neutral-500'
                        }`}
                      >
                        {fx.type.toUpperCase()}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Pan Rotary Slider */}
              <div className="flex flex-col items-center gap-1 bg-neutral-950/60 p-1 rounded-lg border border-neutral-800/50">
                <div className="flex justify-between w-full text-[9px] font-mono text-neutral-500 px-1">
                  <span>L</span>
                  <span className="text-neutral-300 font-bold">
                    {track.pan === 0
                      ? 'C'
                      : track.pan < 0
                      ? `${Math.abs(Math.round(track.pan * 100))}L`
                      : `${Math.round(track.pan * 100)}R`}
                  </span>
                  <span>R</span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={track.pan}
                  onChange={(e) => handlePanChange(track.id, parseFloat(e.target.value))}
                  className="w-24 h-1 accent-cyan-400 bg-neutral-800 rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Fader & Dual Stereo Meter Section */}
              <div className="flex-1 flex items-stretch justify-center gap-3 my-3">
                {/* Vertical Long-Throw Volume Fader */}
                <div className="flex flex-col items-center justify-between py-1">
                  <span className="text-[9px] font-mono text-neutral-500 font-semibold">
                    {volDb} dB
                  </span>
                  <div className="h-44 flex items-center justify-center relative">
                    <input
                      type="range"
                      min="0"
                      max="1.2"
                      step="0.01"
                      value={track.volume}
                      onChange={(e) => handleVolumeChange(track.id, parseFloat(e.target.value))}
                      className="h-40 -rotate-90 w-40 accent-cyan-400 bg-neutral-800 rounded appearance-none cursor-pointer"
                    />
                  </div>
                  <span className="text-[8px] font-mono text-neutral-600">0dB</span>
                </div>

                {/* Vertical Stereo Peak VU Meters */}
                <div className="h-48 w-5 bg-neutral-950 p-1 rounded border border-neutral-800 flex gap-1 items-end relative shadow-inner">
                  {/* Left Meter */}
                  <div className="w-1.5 h-full bg-neutral-900 rounded-xs flex items-end overflow-hidden">
                    <div
                      className="w-full transition-all duration-75"
                      style={{
                        height: `${Math.min(100, Math.max(2, meter.left * 100))}%`,
                        backgroundColor:
                          meter.peakDb > -0.5 ? '#ef4444' : meter.left > 0.75 ? '#eab308' : '#10b981',
                      }}
                    />
                  </div>
                  {/* Right Meter */}
                  <div className="w-1.5 h-full bg-neutral-900 rounded-xs flex items-end overflow-hidden">
                    <div
                      className="w-full transition-all duration-75"
                      style={{
                        height: `${Math.min(100, Math.max(2, meter.right * 100))}%`,
                        backgroundColor:
                          meter.peakDb > -0.5 ? '#ef4444' : meter.right > 0.75 ? '#eab308' : '#10b981',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mute & Solo Buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleMute(track.id)}
                  className={`py-1 rounded text-xs font-black transition cursor-pointer ${
                    track.mute
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={() => handleSolo(track.id)}
                  className={`py-1 rounded text-xs font-black transition cursor-pointer ${
                    track.solo
                      ? 'bg-cyan-400 text-neutral-950'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  SOLO
                </button>
              </div>
            </div>
          );
        })}

        {/* Master Output Channel Strip (Pinned to Right) */}
        <div className="w-44 bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 border-2 border-cyan-500/50 rounded-xl flex flex-col justify-between p-2.5 shadow-2xl shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-cyan-400">MASTER BUS</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
            </div>
            <div className="font-bold text-xs text-neutral-100">Stereo Out 1/2</div>
          </div>

          {/* Master FX Quick link */}
          <div className="my-2 bg-neutral-950 p-1.5 rounded-lg border border-cyan-900/60">
            <div className="flex items-center justify-between text-[9px] text-cyan-400 font-bold uppercase mb-1">
              <span>Master Rack ({project.masterEffects.length})</span>
              <button
                onClick={() => onSelectTrackForFx('master')}
                className="text-cyan-300 hover:text-white cursor-pointer"
              >
                Edit
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {project.masterEffects.map((fx, i) => (
                <div
                  key={i}
                  className="text-[9px] px-1 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/30 truncate"
                >
                  {fx.type.toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          {/* Master Fader & Big Meter */}
          <div className="flex-1 flex items-stretch justify-center gap-3 my-3">
            <div className="flex flex-col items-center justify-between py-1">
              <span className="text-[9px] font-mono text-cyan-400 font-bold">
                {masterMeter.peakDb} dB
              </span>
              <div className="h-44 flex items-center justify-center relative">
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.01"
                  value={project.settings.masterVolume}
                  onChange={(e) => handleMasterVolume(parseFloat(e.target.value))}
                  className="h-40 -rotate-90 w-40 accent-cyan-400 bg-neutral-800 rounded appearance-none cursor-pointer"
                />
              </div>
              <span className="text-[8px] font-mono text-neutral-500">0.0dB</span>
            </div>

            {/* Master Stereo Peak LED Meter */}
            <div className="h-48 w-6 bg-neutral-950 p-1 rounded border border-neutral-800 flex gap-1 items-end relative shadow-inner">
              <div className="w-2 h-full bg-neutral-900 rounded-xs flex items-end overflow-hidden">
                <div
                  className="w-full transition-all duration-75"
                  style={{
                    height: `${Math.min(100, Math.max(2, masterMeter.left * 100))}%`,
                    backgroundColor:
                      masterMeter.peakDb > -0.5 ? '#ef4444' : masterMeter.left > 0.75 ? '#eab308' : '#10b981',
                  }}
                />
              </div>
              <div className="w-2 h-full bg-neutral-900 rounded-xs flex items-end overflow-hidden">
                <div
                  className="w-full transition-all duration-75"
                  style={{
                    height: `${Math.min(100, Math.max(2, masterMeter.right * 100))}%`,
                    backgroundColor:
                      masterMeter.peakDb > -0.5 ? '#ef4444' : masterMeter.right > 0.75 ? '#eab308' : '#10b981',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Master Limiter Protection Badge */}
          <div className="py-1 px-2 bg-cyan-950/60 border border-cyan-800/40 rounded text-[10px] font-mono text-center text-cyan-300 font-bold">
            LIMITER ACTIVE
          </div>
        </div>
      </div>
    </div>
  );
};
