import React, { useState, useRef } from 'react';
import {
  Pencil,
  Eraser,
  Grid,
  Sparkles,
  Volume2,
  Trash2,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Project, Track, MidiNote } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';
import { SCALES, ROOT_NOTES, CHORD_PRESETS } from '../data/defaultProject';

interface PianoRollViewProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  currentBeat: number;
  initialTrackId?: string;
}

export const PianoRollView: React.FC<PianoRollViewProps> = ({
  project,
  onUpdateProject,
  currentBeat,
  initialTrackId,
}) => {
  const engine = AudioEngine.getInstance();

  // Find active track
  const instrumentTracks = project.tracks.filter(
    (t) => t.type === 'instrument' || t.synthConfig
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    initialTrackId || instrumentTracks[0]?.id || project.tracks[0]?.id || ''
  );

  const activeTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const activeClip = activeTrack?.clips.find((c) => c.type === 'midi');

  // Tool Modes
  const [toolMode, setToolMode] = useState<'draw' | 'erase'>('draw');
  const [gridSnap, setGridSnap] = useState<number>(0.25); // 1/16 note = 0.25 beat
  const [selectedRootNote, setSelectedRootNote] = useState<string>('C');
  const [selectedScaleIndex, setSelectedScaleIndex] = useState<number>(2); // Natural Minor default
  const [isScaleHighlightOn, setIsScaleHighlightOn] = useState<boolean>(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Note range: from C2 (36) up to B5 (83)
  const minPitch = 36;
  const maxPitch = 84;
  const numPitches = maxPitch - minPitch;
  const pitchRowHeight = 22; // px per semitone
  const pixelsPerBeat = 64; // px per beat
  const totalBeats = 16; // 4 bars

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Determine which pitches belong to the selected scale
  const scaleIntervals = SCALES[selectedScaleIndex].intervals;
  const rootNoteIndex = ROOT_NOTES.indexOf(selectedRootNote);
  const inScalePitchMap = new Set<number>();

  for (let p = minPitch; p < maxPitch; p++) {
    const pitchClass = (p % 12 + 12) % 12;
    const intervalFromRoot = (pitchClass - rootNoteIndex + 12) % 12;
    if (scaleIntervals.includes(intervalFromRoot)) {
      inScalePitchMap.add(p);
    }
  }

  const getPitchLabel = (pitch: number) => {
    const noteName = ROOT_NOTES[pitch % 12];
    const octave = Math.floor(pitch / 12) - 1;
    return `${noteName}${octave}`;
  };

  const isBlackKey = (pitch: number) => {
    const pc = pitch % 12;
    return [1, 3, 6, 8, 10].includes(pc);
  };

  // Preview Note sound via AudioEngine
  const previewNote = (pitch: number, velocity: number = 0.8) => {
    if (!activeTrack?.synthConfig) return;
    engine.previewSynthNote(activeTrack.synthConfig, pitch, velocity, 0.35);
  };

  // Click on Piano Roll Grid to add / remove note
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridContainerRef.current || !activeTrack || !activeClip) return;

    const rect = gridContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + gridContainerRef.current.scrollLeft;
    const clickY = e.clientY - rect.top + gridContainerRef.current.scrollTop;

    const rawBeat = clickX / pixelsPerBeat;
    const snappedBeat = Math.floor(rawBeat / gridSnap) * gridSnap;

    const pitchIndex = Math.floor(clickY / pitchRowHeight);
    const pitch = maxPitch - 1 - pitchIndex;

    if (pitch < minPitch || pitch >= maxPitch) return;

    // Check if clicking existing note
    const notes = activeClip.midiNotes || [];
    const existingIndex = notes.findIndex(
      (n) =>
        n.pitch === pitch &&
        snappedBeat >= n.startTime &&
        snappedBeat < n.startTime + n.duration
    );

    if (existingIndex !== -1) {
      if (toolMode === 'erase') {
        // Delete note
        deleteNote(notes[existingIndex].id);
      } else {
        setSelectedNoteId(notes[existingIndex].id);
        previewNote(pitch);
      }
      return;
    }

    if (toolMode === 'erase') return;

    // Add new Note
    const newNote: MidiNote = {
      id: 'note_' + Date.now(),
      pitch,
      startTime: snappedBeat,
      duration: gridSnap * 2, // default length: 2 grid steps
      velocity: 100,
    };

    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== activeClip.id) return c;
          return {
            ...c,
            midiNotes: [...(c.midiNotes || []), newNote],
          };
        });
        return { ...t, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });

    setSelectedNoteId(newNote.id);
    previewNote(pitch, newNote.velocity / 127);
  };

  const deleteNote = (noteId: string) => {
    if (!activeClip) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== activeClip.id) return c;
          return {
            ...c,
            midiNotes: (c.midiNotes || []).filter((n) => n.id !== noteId),
          };
        });
        return { ...t, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });
    if (selectedNoteId === noteId) setSelectedNoteId(null);
  };

  // Chord Assistance Injection
  const handleInsertChord = (intervals: number[]) => {
    if (!activeClip) return;
    const basePitch = inScalePitchMap.has(60) ? 60 : minPitch + 24; // C4 approx
    const startTime = currentBeat % 16;

    const chordNotes: MidiNote[] = intervals.map((interval, idx) => ({
      id: 'chord_' + Date.now() + '_' + idx,
      pitch: basePitch + interval,
      startTime,
      duration: 2, // 2 beats
      velocity: 95,
    }));

    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== activeClip.id) return c;
          return {
            ...c,
            midiNotes: [...(c.midiNotes || []), ...chordNotes],
          };
        });
        return { ...t, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });

    // Play chord preview
    chordNotes.forEach((n) => previewNote(n.pitch, 0.8));
  };

  // Quantize Notes
  const handleQuantize = () => {
    if (!activeClip || !activeClip.midiNotes) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== activeClip.id) return c;
          const quantized = (c.midiNotes || []).map((n) => ({
            ...n,
            startTime: Math.round(n.startTime / gridSnap) * gridSnap,
            duration: Math.max(gridSnap, Math.round(n.duration / gridSnap) * gridSnap),
          }));
          return { ...c, midiNotes: quantized };
        });
        return { ...t, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  // Update Note Velocity
  const handleVelocityChange = (noteId: string, val: number) => {
    if (!activeClip) return;
    onUpdateProject((prev) => {
      const updatedTracks = prev.tracks.map((t) => {
        if (t.id !== selectedTrackId) return t;
        const updatedClips = t.clips.map((c) => {
          if (c.id !== activeClip.id) return c;
          const notes = (c.midiNotes || []).map((n) =>
            n.id === noteId ? { ...n, velocity: val } : n
          );
          return { ...c, midiNotes: notes };
        });
        return { ...t, clips: updatedClips };
      });
      return { ...prev, tracks: updatedTracks };
    });
  };

  const activeNotes = activeClip?.midiNotes || [];

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-200">
      {/* Top Piano Roll Control Header */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
        {/* Track Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-semibold">Track:</span>
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 text-xs rounded px-2 py-1 text-cyan-300 font-semibold focus:outline-none"
          >
            {project.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.type})
              </option>
            ))}
          </select>
        </div>

        {/* Tools: Draw & Erase */}
        <div className="flex items-center gap-1 bg-neutral-950 p-0.5 rounded border border-neutral-800">
          <button
            onClick={() => setToolMode('draw')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer font-medium ${
              toolMode === 'draw'
                ? 'bg-cyan-500 text-neutral-950 font-bold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Pencil className="w-3 h-3" />
            <span>Draw</span>
          </button>
          <button
            onClick={() => setToolMode('erase')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer font-medium ${
              toolMode === 'erase'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Eraser className="w-3 h-3" />
            <span>Erase</span>
          </button>
        </div>

        {/* Snap & Quantize */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-xs">
            <Grid className="w-3 h-3 text-neutral-500" />
            <select
              value={gridSnap}
              onChange={(e) => setGridSnap(parseFloat(e.target.value))}
              className="bg-transparent text-neutral-300 text-xs focus:outline-none"
            >
              <option value={1}>1/4 Beat</option>
              <option value={0.5}>1/8 Beat</option>
              <option value={0.25}>1/16 Beat</option>
              <option value={0.125}>1/32 Beat</option>
            </select>
          </div>
          <button
            onClick={handleQuantize}
            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded border border-neutral-700 transition cursor-pointer"
            title="Quantize notes to current grid snap"
          >
            Quantize
          </button>
        </div>

        {/* Scale Highlighting & Root Note */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsScaleHighlightOn(!isScaleHighlightOn)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition cursor-pointer ${
              isScaleHighlightOn
                ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                : 'bg-neutral-900 text-neutral-500 border-neutral-800'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Scale Lock</span>
          </button>

          <select
            value={selectedRootNote}
            onChange={(e) => setSelectedRootNote(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 text-xs rounded px-1.5 py-1 text-neutral-200 focus:outline-none"
          >
            {ROOT_NOTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <select
            value={selectedScaleIndex}
            onChange={(e) => setSelectedScaleIndex(parseInt(e.target.value))}
            className="bg-neutral-950 border border-neutral-800 text-xs rounded px-1.5 py-1 text-neutral-200 focus:outline-none max-w-[140px]"
          >
            {SCALES.map((s, idx) => (
              <option key={s.name} value={idx}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Chord Injectors */}
        <div className="hidden lg:flex items-center gap-1">
          <span className="text-[10px] text-neutral-500 font-semibold uppercase">Chords:</span>
          {CHORD_PRESETS.slice(0, 4).map((c) => (
            <button
              key={c.name}
              onClick={() => handleInsertChord(c.intervals)}
              className="px-1.5 py-0.5 bg-neutral-800 hover:bg-cyan-950 hover:text-cyan-300 text-[10px] rounded border border-neutral-700 transition cursor-pointer"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Piano Roll Body: Vertical Keyboard on Left, Grid on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Vertical Piano Keys */}
        <div
          className="w-20 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 overflow-hidden select-none z-10 shadow-lg"
          style={{ height: `${numPitches * pitchRowHeight}px` }}
        >
          {Array.from({ length: numPitches }).map((_, idx) => {
            const pitch = maxPitch - 1 - idx;
            const black = isBlackKey(pitch);
            const inScale = inScalePitchMap.has(pitch);
            const isRoot = pitch % 12 === rootNoteIndex;

            return (
              <button
                key={pitch}
                onClick={() => previewNote(pitch)}
                className={`h-[22px] px-1.5 flex items-center justify-between border-b text-[10px] font-mono transition cursor-pointer ${
                  black
                    ? 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                    : 'bg-neutral-200 border-neutral-300 text-neutral-900 hover:bg-white'
                }`}
                style={{
                  boxShadow: isRoot ? 'inset 4px 0 0 #06b6d4' : undefined,
                }}
              >
                <span className="font-bold">{getPitchLabel(pitch)}</span>
                {isScaleHighlightOn && inScale && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRoot ? 'bg-cyan-500 ring-1 ring-cyan-300' : 'bg-emerald-500'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Note Grid Area */}
        <div
          ref={gridContainerRef}
          onClick={handleGridClick}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-neutral-950 cursor-crosshair"
          style={{ height: '100%' }}
        >
          <div
            className="relative"
            style={{
              width: `${totalBeats * pixelsPerBeat}px`,
              height: `${numPitches * pitchRowHeight}px`,
            }}
          >
            {/* Horizontal pitch lane backgrounds */}
            {Array.from({ length: numPitches }).map((_, idx) => {
              const pitch = maxPitch - 1 - idx;
              const black = isBlackKey(pitch);
              const inScale = inScalePitchMap.has(pitch);
              const isRoot = pitch % 12 === rootNoteIndex;

              return (
                <div
                  key={pitch}
                  className={`h-[22px] border-b border-neutral-900/60 transition ${
                    isRoot && isScaleHighlightOn
                      ? 'bg-cyan-950/20'
                      : inScale && isScaleHighlightOn
                      ? 'bg-neutral-900/20'
                      : black
                      ? 'bg-neutral-950/80'
                      : 'bg-neutral-900/10'
                  }`}
                />
              );
            })}

            {/* Vertical Beat Grid Lines */}
            <div className="absolute inset-0 flex pointer-events-none">
              {Array.from({ length: totalBeats * 4 }).map((_, stepIdx) => (
                <div
                  key={stepIdx}
                  className={`h-full border-r ${
                    stepIdx % 16 === 0
                      ? 'border-neutral-700'
                      : stepIdx % 4 === 0
                      ? 'border-neutral-800'
                      : 'border-neutral-900/40'
                  }`}
                  style={{ width: `${pixelsPerBeat / 4}px` }}
                />
              ))}
            </div>

            {/* Playhead vertical line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              style={{ left: `${currentBeat * pixelsPerBeat}px` }}
            />

            {/* Rendered MIDI Notes */}
            {activeNotes.map((note) => {
              const top = (maxPitch - 1 - note.pitch) * pitchRowHeight;
              const left = note.startTime * pixelsPerBeat;
              const width = Math.max(12, note.duration * pixelsPerBeat);
              const isSelected = selectedNoteId === note.id;

              return (
                <div
                  key={note.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (toolMode === 'erase') {
                      deleteNote(note.id);
                    } else {
                      setSelectedNoteId(note.id);
                      previewNote(note.pitch, note.velocity / 127);
                    }
                  }}
                  className={`absolute rounded h-[18px] border text-[9px] font-bold px-1 flex items-center justify-between select-none shadow cursor-pointer transition ${
                    isSelected
                      ? 'bg-cyan-400 border-white text-neutral-950 ring-2 ring-cyan-300'
                      : 'bg-gradient-to-r from-cyan-600 to-teal-500 border-cyan-400/80 text-white hover:brightness-110'
                  }`}
                  style={{
                    top: `${top + 2}px`,
                    left: `${left}px`,
                    width: `${width}px`,
                  }}
                >
                  <span className="truncate">{getPitchLabel(note.pitch)}</span>
                  <span className="text-[7px] opacity-80 font-mono ml-0.5">
                    {note.velocity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Velocity Editor Lane */}
      <div className="h-20 bg-neutral-900 border-t border-neutral-800 px-3 flex flex-col shrink-0">
        <div className="h-5 flex items-center justify-between text-[10px] text-neutral-400 font-semibold border-b border-neutral-800/80">
          <span>VELOCITY EDITOR (0 - 127)</span>
          <span>{activeNotes.length} Notes in Pattern</span>
        </div>

        <div className="flex-1 flex items-end gap-1.5 py-1 overflow-x-auto relative">
          {activeNotes.map((note) => {
            const isSelected = selectedNoteId === note.id;
            return (
              <div
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
                className="flex flex-col items-center gap-0.5 group cursor-pointer"
                style={{ width: '16px' }}
              >
                <div className="text-[8px] font-mono text-neutral-500 group-hover:text-cyan-300">
                  {note.velocity}
                </div>
                <div className="w-2.5 h-10 bg-neutral-950 rounded-xs flex items-end border border-neutral-800">
                  <div
                    className={`w-full rounded-xs transition-all ${
                      isSelected ? 'bg-cyan-300' : 'bg-cyan-500 group-hover:bg-cyan-400'
                    }`}
                    style={{ height: `${(note.velocity / 127) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
