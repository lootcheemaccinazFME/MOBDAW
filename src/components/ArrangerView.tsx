import React, { useState, useRef } from 'react';
import {
  Volume2,
  Mic,
  Scissors,
  Copy,
  Trash2,
  Plus,
  ZoomIn,
  ZoomOut,
  Sliders,
  AudioWaveform,
  Music,
  Grid3X3,
  MoreVertical,
} from 'lucide-react';
import { Project, Track, TrackClip, TrackType } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface ArrangerViewProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  currentBeat: number;
  onSelectTrackForPianoRoll?: (trackId: string) => void;
  onSelectTrackForDrums?: (patternId: string) => void;
  onSelectTrackForFx?: (trackId: string) => void;
}

export const ArrangerView: React.FC<ArrangerViewProps> = ({
  project,
  onUpdateProject,
  currentBeat,
  onSelectTrackForPianoRoll,
  onSelectTrackForDrums,
  onSelectTrackForFx,
}) => {
  const engine = AudioEngine.getInstance();
  const [pixelsPerBeat, setPixelsPerBeat] = useState(48); // Horizontal zoom
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(project.tracks[0]?.id || '');
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [dragStartBeat, setDragStartBeat] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const [isResizingClip, setIsResizingClip] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);

  const totalBars = 8;
  const beatsPerBar = project.settings.timeSignatureNumerator || 4;
  const totalBeats = totalBars * beatsPerBar; // 32 beats default display

  // Scrub playhead on ruler click
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const beat = Math.max(0, clickX / pixelsPerBeat);
    // Snap to quarter beat (1/16 note)
    const snapped = Math.round(beat * 4) / 4;
    engine.seek(snapped);
  };

  const handleTrackMute = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) =>
        t.id === trackId ? { ...t, mute: !t.mute } : t
      );
      const updated = { ...prev, tracks: updatedTracks };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleTrackSolo = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateProject((prev) => {
      const isSoloed = prev.tracks.find((t) => t.id === trackId)?.solo;
      const updatedTracks = prev.tracks.map((t) => {
        if (isSoloed) {
          // Unsolo
          return { ...t, solo: false, mute: false };
        } else {
          // Solo this track, mute others
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

  const handleTrackArm = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) =>
        t.id === trackId ? { ...t, armed: !t.armed } : { ...t, armed: false }
      );
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleTrackVolume = (trackId: string, val: number) => {
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

  const handleTrackPan = (trackId: string, val: number) => {
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

  const handleAddTrack = (type: TrackType) => {
    const id = 'track_' + Date.now();
    const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
    const color = colors[project.tracks.length % colors.length];
    const newTrack: Track = {
      id,
      name: `${type.toUpperCase()} Track ${project.tracks.length + 1}`,
      type,
      color,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      armed: false,
      clips: [],
      effects: [],
      automationLanes: [],
      synthConfig:
        type === 'instrument'
          ? {
              osc1: { type: 'sawtooth', octave: 0, semitone: 0, detune: 0, gain: 0.8 },
              osc2: { type: 'square', octave: 0, semitone: 7, detune: 5, gain: 0.4 },
              mix: 0.4,
              filter: { type: 'lowpass', cutoff: 2000, resonance: 2, envAmount: 0.3 },
              ampEnv: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.3 },
              filterEnv: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 0.2 },
              lfo: { waveform: 'sine', rate: 2, depth: 0, target: 'none' },
              glide: 0,
              polyphony: 6,
            }
          : undefined,
    };

    onUpdateProject((prev) => {
      const updated = { ...prev, tracks: [...prev.tracks, newTrack] };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleDeleteTrack = (trackId: string) => {
    if (project.tracks.length <= 1) return;
    onUpdateProject((prev) => {
      const updated = {
        ...prev,
        tracks: prev.tracks.filter((t) => t.id !== trackId),
      };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleDuplicateTrack = (trackId: string) => {
    const orig = project.tracks.find((t) => t.id === trackId);
    if (!orig) return;
    const dup: Track = {
      ...JSON.parse(JSON.stringify(orig)),
      id: 'track_' + Date.now(),
      name: orig.name + ' (Copy)',
    };
    onUpdateProject((prev) => {
      const updated = { ...prev, tracks: [...prev.tracks, dup] };
      engine.setProject(updated);
      return updated;
    });
  };

  // Clip manipulation
  const handleSplitClip = () => {
    if (!selectedClipId) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((track) => {
        const clipIdx = track.clips.findIndex((c) => c.id === selectedClipId);
        if (clipIdx === -1) return track;
        const clip = track.clips[clipIdx];
        const splitPoint = currentBeat - clip.startBeat;
        if (splitPoint <= 0.25 || splitPoint >= clip.durationBeats - 0.25) {
          return track; // Too close to edge
        }

        const firstHalf: TrackClip = {
          ...clip,
          id: 'clip_' + Date.now() + '_a',
          durationBeats: splitPoint,
        };

        const secondHalf: TrackClip = {
          ...clip,
          id: 'clip_' + Date.now() + '_b',
          startBeat: currentBeat,
          durationBeats: clip.durationBeats - splitPoint,
        };

        const newClips = [...track.clips];
        newClips.splice(clipIdx, 1, firstHalf, secondHalf);
        return { ...track, clips: newClips };
      });

      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleDuplicateClip = () => {
    if (!selectedClipId) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((track) => {
        const clip = track.clips.find((c) => c.id === selectedClipId);
        if (!clip) return track;
        const dup: TrackClip = {
          ...JSON.parse(JSON.stringify(clip)),
          id: 'clip_' + Date.now(),
          startBeat: clip.startBeat + clip.durationBeats,
        };
        return { ...track, clips: [...track.clips, dup] };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  const handleDeleteClip = () => {
    if (!selectedClipId) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== selectedClipId),
      }));
      return { ...prev, tracks: updatedTracks };
    });
    setSelectedClipId(null);
  };

  // Drag & Move Clip
  const onClipMouseDown = (clip: TrackClip, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    setIsDraggingClip(true);
    setDragStartBeat(clip.startBeat);
    setDragStartX(e.clientX);
  };

  const onTimelineMouseMove = (e: React.MouseEvent) => {
    if (!selectedClipId) return;

    if (isDraggingClip) {
      const deltaX = e.clientX - dragStartX;
      const deltaBeats = deltaX / pixelsPerBeat;
      const rawNewBeat = dragStartBeat + deltaBeats;
      const snapped = Math.max(0, Math.round(rawNewBeat * 2) / 2); // snap to 1/8th note

      onUpdateProject((prev) => {
        const updatedTracks = prev.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((c) =>
            c.id === selectedClipId ? { ...c, startBeat: snapped } : c
          ),
        }));
        return { ...prev, tracks: updatedTracks };
      });
    } else if (isResizingClip) {
      const deltaX = e.clientX - dragStartX;
      const deltaBeats = deltaX / pixelsPerBeat;
      onUpdateProject((prev) => {
        const updatedTracks = prev.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((c) => {
            if (c.id === selectedClipId) {
              const newDuration = Math.max(0.5, Math.round((c.durationBeats + deltaBeats) * 2) / 2);
              return { ...c, durationBeats: newDuration };
            }
            return c;
          }),
        }));
        return { ...prev, tracks: updatedTracks };
      });
      setDragStartX(e.clientX);
    }
  };

  const onTimelineMouseUp = () => {
    setIsDraggingClip(false);
    setIsResizingClip(false);
  };

  // Get track icon
  const getTrackIcon = (type: TrackType) => {
    switch (type) {
      case 'drum':
        return <Grid3X3 className="w-3.5 h-3.5 text-rose-400" />;
      case 'instrument':
        return <Music className="w-3.5 h-3.5 text-cyan-400" />;
      case 'audio':
        return <AudioWaveform className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Sliders className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  return (
    <div
      className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden"
      onMouseMove={onTimelineMouseMove}
      onMouseUp={onTimelineMouseUp}
      onMouseLeave={onTimelineMouseUp}
    >
      {/* Top Arranger Toolbar */}
      <div className="h-10 bg-neutral-900/90 border-b border-neutral-800 px-3 flex items-center justify-between gap-2 shrink-0">
        {/* Left Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleAddTrack('instrument')}
            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/60 rounded text-xs font-medium transition cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Synth Track</span>
          </button>
          <button
            onClick={() => handleAddTrack('drum')}
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded text-xs font-medium transition cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Drum Track</span>
          </button>
          <button
            onClick={() => handleAddTrack('audio')}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 rounded text-xs font-medium transition cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Audio Track</span>
          </button>
        </div>

        {/* Clip Edit Actions */}
        <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded p-0.5">
          <button
            onClick={handleSplitClip}
            disabled={!selectedClipId}
            className="p-1 text-neutral-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-neutral-400 rounded transition cursor-pointer"
            title="Split Clip at Playhead (Scissors)"
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDuplicateClip}
            disabled={!selectedClipId}
            className="p-1 text-neutral-400 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-neutral-400 rounded transition cursor-pointer"
            title="Duplicate Selected Clip"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteClip}
            disabled={!selectedClipId}
            className="p-1 text-neutral-400 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-neutral-400 rounded transition cursor-pointer"
            title="Delete Selected Clip"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPixelsPerBeat((p) => Math.max(24, p - 8))}
            className="p-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-neutral-500 w-10 text-center">
            {pixelsPerBeat}px
          </span>
          <button
            onClick={() => setPixelsPerBeat((p) => Math.min(96, p + 8))}
            className="p-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-400 hover:text-neutral-200"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Arrangement Canvas: Left Headers + Right Scrollable Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column (Fixed Width) */}
        <div className="w-64 bg-neutral-900/90 border-r border-neutral-800 flex flex-col shrink-0 overflow-y-auto z-10 shadow-lg">
          {/* Top ruler placeholder */}
          <div className="h-8 bg-neutral-950 border-b border-neutral-800 px-3 flex items-center justify-between text-[11px] font-semibold text-neutral-400">
            <span>TRACK LIST</span>
            <span className="text-[10px] text-neutral-600">{project.tracks.length} Tracks</span>
          </div>

          {/* Track Headers */}
          <div className="flex-1 divide-y divide-neutral-800/80">
            {project.tracks.map((track) => (
              <div
                key={track.id}
                onClick={() => setSelectedTrackId(track.id)}
                className={`h-20 p-2 flex flex-col justify-between transition cursor-pointer border-l-4 ${
                  selectedTrackId === track.id
                    ? 'bg-neutral-800/80 border-cyan-400'
                    : 'bg-neutral-900/40 hover:bg-neutral-800/40 border-transparent'
                }`}
                style={{ borderLeftColor: track.color }}
              >
                {/* Track Title & Badges */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 truncate">
                    {getTrackIcon(track.type)}
                    <span className="text-xs font-bold text-neutral-200 truncate">
                      {track.name}
                    </span>
                  </div>

                  {/* Actions / Routing shortcuts */}
                  <div className="flex items-center gap-1">
                    {track.type === 'instrument' && onSelectTrackForPianoRoll && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTrackForPianoRoll(track.id);
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded hover:bg-cyan-900"
                        title="Open in Piano Roll"
                      >
                        Notes
                      </button>
                    )}
                    {track.type === 'drum' && onSelectTrackForDrums && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTrackForDrums('drum_pattern_1');
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-rose-950 text-rose-300 border border-rose-800/60 rounded hover:bg-rose-900"
                        title="Open Drum Sequencer"
                      >
                        Steps
                      </button>
                    )}
                    {onSelectTrackForFx && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTrackForFx(track.id);
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
                        title="Open FX Rack"
                      >
                        FX
                      </button>
                    )}
                  </div>
                </div>

                {/* Track Controls: Vol, Pan, Mute, Solo, Arm */}
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  {/* M / S / R buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleTrackMute(track.id, e)}
                      className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center transition ${
                        track.mute
                          ? 'bg-amber-500 text-neutral-950 font-bold'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      onClick={(e) => handleTrackSolo(track.id, e)}
                      className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center transition ${
                        track.solo
                          ? 'bg-cyan-400 text-neutral-950 font-bold'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                      title="Solo"
                    >
                      S
                    </button>
                    <button
                      onClick={(e) => handleTrackArm(track.id, e)}
                      className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center transition ${
                        track.armed
                          ? 'bg-rose-600 text-white font-bold animate-pulse'
                          : 'bg-neutral-800 text-neutral-400 hover:text-rose-400'
                      }`}
                      title="Arm Track for Recording"
                    >
                      <Mic className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Volume Slider & Pan */}
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-neutral-500">VOL</span>
                      <input
                        type="range"
                        min="0"
                        max="1.2"
                        step="0.02"
                        value={track.volume}
                        onChange={(e) => handleTrackVolume(track.id, parseFloat(e.target.value))}
                        className="w-14 h-1 accent-cyan-400 bg-neutral-800 rounded appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Area (Ruler + Tracks Grid + Clips) */}
        <div
          ref={timelineRef}
          className="flex-1 bg-neutral-950 overflow-x-auto overflow-y-auto relative"
          style={{ cursor: isDraggingClip ? 'grabbing' : 'default' }}
        >
          {/* Top Ruler Bar */}
          <div
            onClick={handleRulerClick}
            className="h-8 bg-neutral-950 border-b border-neutral-800 sticky top-0 z-20 flex cursor-pointer"
            style={{ width: `${totalBeats * pixelsPerBeat}px` }}
          >
            {Array.from({ length: totalBars }).map((_, barIdx) => (
              <div
                key={barIdx}
                className="h-full border-r border-neutral-800 px-1 flex items-center justify-between text-[10px] font-mono text-neutral-400 select-none"
                style={{ width: `${beatsPerBar * pixelsPerBeat}px` }}
              >
                <span className="font-bold text-neutral-300">Bar {barIdx + 1}</span>
                <span className="text-[8px] text-neutral-600">.2 .3 .4</span>
              </div>
            ))}

            {/* Loop Bracket overlay */}
            {project.settings.isLooping && (
              <div
                className="absolute top-0 bottom-0 bg-cyan-500/10 border-x-2 border-cyan-400/80 pointer-events-none"
                style={{
                  left: `${project.settings.loopStartBeat * pixelsPerBeat}px`,
                  width: `${(project.settings.loopEndBeat - project.settings.loopStartBeat) * pixelsPerBeat}px`,
                }}
              />
            )}
          </div>

          {/* Tracks Horizontal Lanes */}
          <div
            className="relative divide-y divide-neutral-800/80"
            style={{ width: `${totalBeats * pixelsPerBeat}px` }}
          >
            {/* Playhead vertical line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              style={{ left: `${currentBeat * pixelsPerBeat}px` }}
            >
              <div className="w-2.5 h-2.5 -ml-1 bg-cyan-400 rotate-45 transform -translate-y-1.5 shadow" />
            </div>

            {project.tracks.map((track) => (
              <div
                key={track.id}
                className="h-20 relative bg-neutral-950/50 hover:bg-neutral-900/20 transition overflow-hidden"
              >
                {/* Vertical Beat Grid Lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {Array.from({ length: totalBeats }).map((_, bIdx) => (
                    <div
                      key={bIdx}
                      className={`h-full border-r ${
                        bIdx % 4 === 0 ? 'border-neutral-800' : 'border-neutral-900/60'
                      }`}
                      style={{ width: `${pixelsPerBeat}px` }}
                    />
                  ))}
                </div>

                {/* Clips in this track */}
                {track.clips.map((clip) => {
                  const isSelected = selectedClipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      onMouseDown={(e) => onClipMouseDown(clip, e)}
                      className={`absolute top-2 bottom-2 rounded-md border text-xs overflow-hidden shadow-md flex flex-col justify-between p-1.5 cursor-grab active:cursor-grabbing transition-colors ${
                        isSelected
                          ? 'border-white ring-2 ring-cyan-400/50 z-10'
                          : 'border-neutral-700/60 hover:border-neutral-500'
                      }`}
                      style={{
                        left: `${clip.startBeat * pixelsPerBeat}px`,
                        width: `${clip.durationBeats * pixelsPerBeat}px`,
                        backgroundColor: `${track.color}25`,
                      }}
                    >
                      {/* Clip Header Label */}
                      <div className="flex items-center justify-between gap-1 pointer-events-none">
                        <span
                          className="font-bold text-[10px] truncate"
                          style={{ color: track.color }}
                        >
                          {clip.name}
                        </span>
                        <span className="text-[8px] opacity-70 font-mono text-neutral-400">
                          {clip.durationBeats}b
                        </span>
                      </div>

                      {/* Visual Content Representation (Mini notes / drum hits / waveform) */}
                      <div className="flex-1 flex items-center justify-center my-0.5 overflow-hidden opacity-60">
                        {clip.type === 'midi' && (
                          <div className="w-full h-4 flex items-end gap-1 px-1">
                            {clip.midiNotes?.slice(0, 16).map((n, idx) => (
                              <div
                                key={idx}
                                className="h-2 rounded-xs flex-1"
                                style={{
                                  backgroundColor: track.color,
                                  height: `${Math.min(100, Math.max(20, (n.pitch / 80) * 100))}%`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                        {clip.type === 'drum' && (
                          <div className="w-full flex items-center justify-around px-1">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: track.color }}
                              />
                            ))}
                          </div>
                        )}
                        {clip.type === 'audio' && (
                          <div className="w-full flex items-center justify-center gap-0.5 h-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-1 rounded-xs"
                                style={{
                                  backgroundColor: track.color,
                                  height: `${(Math.sin(i * 0.8) * 0.5 + 0.5) * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right Edge Resize Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                          setIsResizingClip(true);
                          setDragStartX(e.clientX);
                        }}
                        className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-ew-resize rounded-r-md"
                        title="Resize Clip"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
