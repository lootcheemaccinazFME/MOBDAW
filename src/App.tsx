import React, { useState, useEffect, useCallback } from 'react';
import { Project, WorkspaceView } from './types/daw';
import { DEFAULT_PROJECT } from './data/defaultProject';
import { AudioEngine } from './audio/AudioEngine';
import { useProjectHistory } from './history/useProjectHistory';
import { HeaderBar } from './components/HeaderBar';
import { ArrangerView } from './components/ArrangerView';
import { PianoRollView } from './components/PianoRollView';
import { DrumSequencerView } from './components/DrumSequencerView';
import { MixerScreen } from './components/MixerScreen';
import { SynthesizerView } from './components/SynthesizerView';
import { EffectsRackView } from './components/EffectsRackView';
import { AudioRecorderModal } from './components/AudioRecorderModal';
import { ExportModal } from './components/ExportModal';
import { NativeArchitectureModal } from './components/NativeArchitectureModal';
import { PCPluginModal } from './components/PCPluginModal';

export default function App() {
  const getInitialProject = (): Project => {
    try {
      const saved = localStorage.getItem('aura_daw_project');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load project from storage', e);
    }
    return DEFAULT_PROJECT;
  };

  const {
    project,
    updateProject,
    undo,
    redo,
    jumpToStep,
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    historyList,
  } = useProjectHistory(getInitialProject());

  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceView>('arranger');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(0);

  // Modals state
  const [isAudioRecordModalOpen, setIsAudioRecordModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isArchitectureModalOpen, setIsArchitectureModalOpen] = useState<boolean>(false);
  const [isPCPluginModalOpen, setIsPCPluginModalOpen] = useState<boolean>(false);

  // Contextual target track for views
  const [targetTrackId, setTargetTrackId] = useState<string>(project.tracks[0]?.id || '');

  const engine = AudioEngine.getInstance();

  // Save project to localStorage periodically
  useEffect(() => {
    try {
      localStorage.setItem('aura_daw_project', JSON.stringify(project));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }, [project]);

  // Sync project into AudioEngine
  useEffect(() => {
    engine.setProject(project);
    engine.setOnBeatCallback((beat) => {
      setCurrentBeat(beat);
    });
  }, [project, engine]);

  // Handle Play/Pause
  const handlePlay = useCallback(() => {
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.play();
      setIsPlaying(true);
    }
  }, [isPlaying, engine]);

  // Handle Stop
  const handleStop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
    setIsRecording(false);
    setCurrentBeat(0);
  }, [engine]);

  // Handle Record
  const handleRecord = useCallback(() => {
    setIsAudioRecordModalOpen(true);
  }, []);

  // Handle Rewind
  const handleRewind = useCallback(() => {
    engine.seek(0);
    setCurrentBeat(0);
  }, [engine]);

  // Metronome toggle
  const handleToggleMetronome = useCallback(() => {
    updateProject((prev) => {
      const updated = {
        ...prev,
        settings: { ...prev.settings, metronome: !prev.settings.metronome },
      };
      engine.setProject(updated);
      return updated;
    }, 'Toggle Metronome');
  }, [engine, updateProject]);

  // Loop toggle
  const handleToggleLoop = useCallback(() => {
    updateProject((prev) => {
      const updated = {
        ...prev,
        settings: { ...prev.settings, isLooping: !prev.settings.isLooping },
      };
      engine.setProject(updated);
      return updated;
    }, 'Toggle Loop');
  }, [engine, updateProject]);

  // BPM change
  const handleBpmChange = useCallback(
    (newBpm: number) => {
      updateProject(
        (prev) => {
          const updated = {
            ...prev,
            settings: { ...prev.settings, bpm: newBpm },
          };
          engine.setProject(updated);
          return updated;
        },
        `Set Tempo to ${newBpm} BPM`,
        { debounceTimeMs: 300 }
      );
    },
    [engine, updateProject]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside an input or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlay();
      } else if (e.code === 'KeyR' && (e.metaKey || e.ctrlKey)) {
        // Allow refresh
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        handleRecord();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMetronome();
      } else if (e.code === 'Digit1') {
        setCurrentWorkspace('arranger');
      } else if (e.code === 'Digit2') {
        setCurrentWorkspace('piano-roll');
      } else if (e.code === 'Digit3') {
        setCurrentWorkspace('drum-sequencer');
      } else if (e.code === 'Digit4') {
        setCurrentWorkspace('mixer');
      } else if (e.code === 'Digit5') {
        setCurrentWorkspace('synth');
      } else if (e.code === 'Digit6') {
        setCurrentWorkspace('effects');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlay, handleRecord, handleToggleMetronome]);

  // Routing to specific workspaces with target track
  const handleSelectTrackForPianoRoll = (trackId: string) => {
    setTargetTrackId(trackId);
    setCurrentWorkspace('piano-roll');
  };

  const handleSelectTrackForDrums = (_patternId: string) => {
    setCurrentWorkspace('drum-sequencer');
  };

  const handleSelectTrackForFx = (trackId: string) => {
    setTargetTrackId(trackId);
    setCurrentWorkspace('effects');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 font-sans text-neutral-100">
      {/* Top Professional DAW Transport & Navigation Header */}
      <HeaderBar
        project={project}
        currentWorkspace={currentWorkspace}
        isPlaying={isPlaying}
        isRecording={isRecording}
        currentBeat={currentBeat}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
        onRewind={handleRewind}
        onToggleMetronome={handleToggleMetronome}
        onToggleLoop={handleToggleLoop}
        onBpmChange={handleBpmChange}
        onSelectWorkspace={setCurrentWorkspace}
        canUndo={canUndo}
        canRedo={canRedo}
        undoDescription={undoDescription}
        redoDescription={redoDescription}
        historyList={historyList}
        onUndo={undo}
        onRedo={redo}
        onJumpToStep={jumpToStep}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenPCPlugins={() => setIsPCPluginModalOpen(true)}
        onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
      />

      {/* Main Workspace Active View */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {currentWorkspace === 'arranger' && (
          <ArrangerView
            project={project}
            onUpdateProject={updateProject}
            currentBeat={currentBeat}
            onSelectTrackForPianoRoll={handleSelectTrackForPianoRoll}
            onSelectTrackForDrums={handleSelectTrackForDrums}
            onSelectTrackForFx={handleSelectTrackForFx}
          />
        )}

        {currentWorkspace === 'piano-roll' && (
          <PianoRollView
            project={project}
            onUpdateProject={updateProject}
            currentBeat={currentBeat}
            initialTrackId={targetTrackId}
          />
        )}

        {currentWorkspace === 'drum-sequencer' && (
          <DrumSequencerView
            project={project}
            onUpdateProject={updateProject}
            currentBeat={currentBeat}
          />
        )}

        {currentWorkspace === 'mixer' && (
          <MixerScreen
            project={project}
            onUpdateProject={updateProject}
            onSelectTrackForFx={handleSelectTrackForFx}
          />
        )}

        {currentWorkspace === 'synth' && (
          <SynthesizerView
            project={project}
            onUpdateProject={updateProject}
            initialTrackId={targetTrackId}
          />
        )}

        {currentWorkspace === 'effects' && (
          <EffectsRackView
            project={project}
            onUpdateProject={updateProject}
            initialTrackId={targetTrackId}
            onOpenPCPlugins={() => setIsPCPluginModalOpen(true)}
          />
        )}
      </div>

      {/* Audio Recorder Modal */}
      <AudioRecorderModal
        isOpen={isAudioRecordModalOpen}
        onClose={() => setIsAudioRecordModalOpen(false)}
        project={project}
        onUpdateProject={updateProject}
        currentBeat={currentBeat}
      />

      {/* Audio Mixdown & Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={project}
      />

      {/* PC Plugins Manager & VST3/CLAP Bridge Modal */}
      <PCPluginModal
        isOpen={isPCPluginModalOpen}
        onClose={() => setIsPCPluginModalOpen(false)}
        project={project}
        onUpdateProject={updateProject}
      />

      {/* Android Native C++ Oboe / NDK Architecture Source Inspector */}
      <NativeArchitectureModal
        isOpen={isArchitectureModalOpen}
        onClose={() => setIsArchitectureModalOpen(false)}
      />
    </div>
  );
}
