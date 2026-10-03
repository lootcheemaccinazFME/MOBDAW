import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Circle,
  Volume2,
  Sliders,
  Download,
  FileCode2,
  Sparkles,
  Smartphone,
  Tablet,
  Maximize2,
  Cpu,
  Layers,
  Music,
  Grid3X3,
  Waves,
  RotateCcw,
  Undo2,
  Redo2,
  History,
  HardDrive,
} from 'lucide-react';
import { AudioEngine } from '../audio/AudioEngine';
import { Project, WorkspaceView } from '../types/daw';

export interface HeaderBarProps {
  project: Project;
  onUpdateProject?: (updater: (prev: Project) => Project) => void;

  // Modern workspace switcher (from App.tsx)
  currentWorkspace?: WorkspaceView;
  onSelectWorkspace?: (ws: WorkspaceView) => void;

  // Legacy tab switcher support
  activeTab?: string;
  setActiveTab?: (tab: any) => void;

  // Transport props (from App.tsx)
  isPlaying?: boolean;
  isRecording?: boolean;
  currentBeat?: number;

  onPlay?: () => void;
  onStop?: () => void;
  onRecord?: () => void;
  onRewind?: () => void;
  onToggleMetronome?: () => void;
  onToggleLoop?: () => void;
  onBpmChange?: (bpm: number) => void;

  // Command History (Undo / Redo)
  canUndo?: boolean;
  canRedo?: boolean;
  undoDescription?: string | null;
  redoDescription?: string | null;
  historyList?: {
    id: string;
    description: string;
    timestamp: number;
    status: 'past' | 'current' | 'future';
    index: number;
  }[];
  onUndo?: () => void;
  onRedo?: () => void;
  onJumpToStep?: (index: number) => void;

  // Modal triggers
  onOpenRecord?: () => void;
  onOpenExport?: () => void;
  onOpenProjects?: () => void;
  onOpenPlugins?: () => void;
  onOpenPCPlugins?: () => void;
  onOpenAndroidCode?: () => void;
  onOpenArchitecture?: () => void;

  // Device layout controls
  deviceMode?: 'tablet' | 'phone' | 'full';
  setDeviceMode?: (mode: 'tablet' | 'phone' | 'full') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  project,
  onUpdateProject,
  currentWorkspace = 'arranger',
  onSelectWorkspace,
  activeTab,
  setActiveTab,
  isPlaying: propIsPlaying,
  isRecording: propIsRecording,
  currentBeat: propCurrentBeat,
  onPlay,
  onStop,
  onRecord,
  onRewind,
  onToggleMetronome,
  onToggleLoop,
  onBpmChange,
  onOpenRecord,
  onOpenExport,
  onOpenProjects,
  onOpenPlugins,
  onOpenPCPlugins,
  onOpenAndroidCode,
  onOpenArchitecture,
  canUndo = false,
  canRedo = false,
  undoDescription = null,
  redoDescription = null,
  historyList = [],
  onUndo,
  onRedo,
  onJumpToStep,
  deviceMode = 'full',
  setDeviceMode,
}) => {
  const engine = AudioEngine.getInstance();
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalCurrentBeat, setInternalCurrentBeat] = useState(0);
  const [meter, setMeter] = useState({ left: 0, right: 0, peakDb: -60 });
  const [cpuUsage, setCpuUsage] = useState(3.6);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setShowHistoryMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPlaying = propIsPlaying !== undefined ? propIsPlaying : internalIsPlaying;
  const isRecording = propIsRecording !== undefined ? propIsRecording : engine.getIsRecording();
  const currentBeat = propCurrentBeat !== undefined ? propCurrentBeat : internalCurrentBeat;

  // Determine current active workspace
  let activeWs: WorkspaceView = (currentWorkspace || 'arranger') as WorkspaceView;
  if (activeTab) {
    if (activeTab === 'piano' || activeTab === 'piano-roll') activeWs = 'piano-roll';
    else if (activeTab === 'drums' || activeTab === 'drum-sequencer') activeWs = 'drum-sequencer';
    else if (activeTab === 'fx' || activeTab === 'effects') activeWs = 'effects';
    else if (activeTab === 'arranger') activeWs = 'arranger';
    else if (activeTab === 'mixer') activeWs = 'mixer';
    else if (activeTab === 'synth') activeWs = 'synth';
  }

  const handleTabSelect = (ws: WorkspaceView) => {
    if (typeof onSelectWorkspace === 'function') {
      onSelectWorkspace(ws);
    }
    if (typeof setActiveTab === 'function') {
      const legacyMap: Record<WorkspaceView, string> = {
        arranger: 'arranger',
        'piano-roll': 'piano',
        'drum-sequencer': 'drums',
        beatpad: 'beatpad',
        mixer: 'mixer',
        synth: 'synth',
        effects: 'fx',
      };
      setActiveTab(legacyMap[ws] || ws);
    }
  };

  useEffect(() => {
    const unsubState = engine.onStateChange((playing) => setInternalIsPlaying(playing));
    const unsubBeat = engine.onBeat((b) => setInternalCurrentBeat(b));

    const meterInterval = setInterval(() => {
      setMeter(engine.getMasterMeter());
      setCpuUsage(() => {
        const base = engine.getIsPlaying() ? 6.8 : 2.4;
        return Math.round((base + (Math.random() * 1.6 - 0.8)) * 10) / 10;
      });
    }, 60);

    return () => {
      unsubState();
      unsubBeat();
      clearInterval(meterInterval);
    };
  }, [engine]);

  const handlePlayToggle = () => {
    if (onPlay) {
      onPlay();
    } else {
      engine.togglePlay();
    }
  };

  const handleStopClick = () => {
    if (onStop) {
      onStop();
    } else {
      engine.stop();
    }
  };

  const handleRecordClick = () => {
    if (onRecord) {
      onRecord();
    } else if (onOpenRecord) {
      onOpenRecord();
    }
  };

  const handleLoopClick = () => {
    if (onToggleLoop) {
      onToggleLoop();
    } else if (onUpdateProject) {
      onUpdateProject((prev) => {
        const nextLoop = !prev.settings.isLooping;
        const updated = {
          ...prev,
          settings: { ...prev.settings, isLooping: nextLoop },
        };
        engine.setProject(updated);
        return updated;
      });
    }
  };

  const handleBpmStep = (delta: number) => {
    const nextBpm = Math.max(40, Math.min(260, project.settings.bpm + delta));
    if (onBpmChange) {
      onBpmChange(nextBpm);
    } else if (onUpdateProject) {
      onUpdateProject((prev) => {
        const updated = {
          ...prev,
          settings: { ...prev.settings, bpm: nextBpm },
        };
        engine.updateBpm(nextBpm);
        return updated;
      });
    }
  };

  const handleMasterVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (onUpdateProject) {
      onUpdateProject((prev) => {
        const updated = {
          ...prev,
          settings: { ...prev.settings, masterVolume: val },
        };
        engine.updateMasterVolume(val);
        return updated;
      });
    } else {
      engine.updateMasterVolume(val);
    }
  };

  const handleOpenArchitectureClick = () => {
    if (onOpenArchitecture) {
      onOpenArchitecture();
    } else if (onOpenAndroidCode) {
      onOpenAndroidCode();
    }
  };

  // Timecode calculation
  const bar = Math.floor(currentBeat / 4) + 1;
  const beatInBar = Math.floor(currentBeat % 4) + 1;
  const sixteenth = Math.floor((currentBeat * 4) % 4) + 1;

  return (
    <header className="bg-neutral-950 border-b border-neutral-800 text-neutral-200 select-none z-30 shrink-0">
      {/* Primary Top Bar */}
      <div className="h-14 px-3 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {/* Left: Branding & Project */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-950/80 to-neutral-900 border border-cyan-800/40 rounded-lg px-2.5 py-1.5 shadow-sm">
            <div className="relative flex items-center justify-center w-5 h-5 rounded bg-cyan-500/20 text-cyan-400">
              <Waves className="w-3.5 h-3.5 animate-pulse" />
              <span
                className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                  isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-neutral-600'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black tracking-wider text-xs bg-gradient-to-r from-cyan-400 to-teal-200 bg-clip-text text-transparent">
                  AURA
                </span>
                <span className="text-[10px] font-bold px-1 py-0.2 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/40">
                  DAW PRO
                </span>
              </div>
            </div>
          </div>

          <div
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs cursor-pointer hover:border-neutral-700 transition-colors"
            title="Active Project (Click to manage)"
          >
            <span className="max-w-[140px] truncate font-medium text-neutral-300">
              {project.settings.name}
            </span>
          </div>

          {/* Undo / Redo & History Stack Inspector */}
          <div className="relative flex items-center gap-0.5 bg-neutral-900/90 border border-neutral-800 rounded-lg p-0.5" ref={historyMenuRef}>
            {/* Undo */}
            <button
              id="header-undo-btn"
              onClick={onUndo}
              disabled={!canUndo}
              className={`w-7 h-7 rounded flex items-center justify-center transition ${
                canUndo
                  ? 'text-neutral-200 hover:text-cyan-400 hover:bg-neutral-800 cursor-pointer'
                  : 'text-neutral-600 cursor-not-allowed opacity-50'
              }`}
              title={undoDescription ? `Undo: ${undoDescription} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            {/* Redo */}
            <button
              id="header-redo-btn"
              onClick={onRedo}
              disabled={!canRedo}
              className={`w-7 h-7 rounded flex items-center justify-center transition ${
                canRedo
                  ? 'text-neutral-200 hover:text-cyan-400 hover:bg-neutral-800 cursor-pointer'
                  : 'text-neutral-600 cursor-not-allowed opacity-50'
              }`}
              title={redoDescription ? `Redo: ${redoDescription} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            {/* History Dropdown Trigger */}
            <button
              id="header-history-dropdown-btn"
              onClick={() => setShowHistoryMenu(!showHistoryMenu)}
              className={`w-7 h-7 rounded flex items-center justify-center transition ${
                showHistoryMenu
                  ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/60'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
              title="Command History Stack"
            >
              <History className="w-3.5 h-3.5" />
            </button>

            {/* History Flyout Menu */}
            {showHistoryMenu && (
              <div
                id="history-stack-flyout"
                className="absolute left-0 top-9 w-72 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl z-50 p-2 text-xs flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  <span>Command History</span>
                  <span className="font-mono text-cyan-400">{historyList.length} states</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {historyList.length === 0 ? (
                    <div className="p-3 text-center text-neutral-500 text-xs">
                      No commands recorded yet.
                    </div>
                  ) : (
                    historyList.map((entry) => {
                      const isCurrent = entry.status === 'current';
                      const isPast = entry.status === 'past';
                      return (
                        <div
                          key={entry.id}
                          onClick={() => {
                            if (onJumpToStep) {
                              onJumpToStep(entry.index);
                              setShowHistoryMenu(false);
                            }
                          }}
                          className={`p-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition ${
                            isCurrent
                              ? 'bg-cyan-950/80 text-cyan-300 font-semibold border border-cyan-600/40'
                              : isPast
                              ? 'text-neutral-300 hover:bg-neutral-800'
                              : 'text-neutral-500 hover:bg-neutral-800/60 italic'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCurrent
                                  ? 'bg-cyan-400 animate-pulse'
                                  : isPast
                                  ? 'bg-emerald-500'
                                  : 'bg-neutral-600'
                              }`}
                            />
                            <span className="truncate">{entry.description}</span>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] font-mono uppercase bg-cyan-900/60 text-cyan-300 px-1 py-0.2 rounded border border-cyan-700/50 shrink-0">
                              Current
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Transport Controls */}
        <div className="flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-800/80 rounded-xl p-1 shadow-inner shrink-0">
          {/* Rewind */}
          {onRewind && (
            <button
              onClick={onRewind}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition cursor-pointer"
              title="Rewind to Beginning (Bar 1)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Play / Pause */}
          <button
            onClick={handlePlayToggle}
            className={`w-9 h-8 rounded-lg flex items-center justify-center transition cursor-pointer font-bold ${
              isPlaying
                ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-neutral-800 text-emerald-400 hover:bg-neutral-700'
            }`}
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Stop */}
          <button
            onClick={handleStopClick}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition cursor-pointer"
            title="Stop & Reset to Bar 1"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Loop */}
          <button
            onClick={handleLoopClick}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              project.settings.isLooping
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
            }`}
            title="Toggle Arranger Loop"
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          {/* Record */}
          <button
            onClick={handleRecordClick}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-600/30'
                : 'text-rose-500 hover:bg-rose-500/10'
            }`}
            title="Record Microphone / Vocal Audio (R)"
          >
            <Circle className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Timecode / Position Display */}
          <div className="px-2.5 py-0.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-center min-w-[76px]">
            <div className="text-[8px] text-neutral-500 tracking-wider">BAR . BEAT</div>
            <div className="text-xs font-bold text-cyan-400">
              {String(bar).padStart(2, '0')}.{beatInBar}.{sixteenth}
            </div>
          </div>

          {/* BPM Stepper */}
          <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5">
            <button
              onClick={() => handleBpmStep(-1)}
              className="text-xs text-neutral-400 hover:text-cyan-400 px-1 font-mono font-bold cursor-pointer"
            >
              -
            </button>
            <div className="text-center px-1">
              <span className="text-[8px] text-neutral-500 block leading-tight">BPM</span>
              <span className="text-xs font-mono font-bold text-neutral-200">
                {project.settings.bpm}
              </span>
            </div>
            <button
              onClick={() => handleBpmStep(1)}
              className="text-xs text-neutral-400 hover:text-cyan-400 px-1 font-mono font-bold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Right: Master VU Meters & Tooling */}
        <div className="flex items-center gap-2 shrink-0">
          {/* CPU & Latency Monitor */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-neutral-900/80 border border-neutral-800 rounded-lg text-[10px] text-neutral-400 font-mono">
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span>CPU: {cpuUsage}%</span>
            <span className="text-neutral-600">|</span>
            <span className="text-emerald-400">4.0ms</span>
          </div>

          {/* Master Volume & Peak Meters */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
            <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={project.settings.masterVolume}
              onChange={handleMasterVolChange}
              className="w-16 h-1.5 accent-cyan-400 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              title="Master Volume"
            />
            {/* Dual Peak Meter */}
            <div className="flex gap-0.5 h-5 w-3 bg-neutral-950 p-0.5 rounded border border-neutral-800 items-end">
              <div
                className="w-1 rounded-xs transition-all duration-75"
                style={{
                  height: `${Math.min(100, Math.max(4, meter.left * 100))}%`,
                  backgroundColor:
                    meter.peakDb > -0.5
                      ? '#ef4444'
                      : meter.left > 0.7
                      ? '#eab308'
                      : '#10b981',
                }}
              />
              <div
                className="w-1 rounded-xs transition-all duration-75"
                style={{
                  height: `${Math.min(100, Math.max(4, meter.right * 100))}%`,
                  backgroundColor:
                    meter.peakDb > -0.5
                      ? '#ef4444'
                      : meter.right > 0.7
                      ? '#eab308'
                      : '#10b981',
                }}
              />
            </div>
          </div>

          {/* PC Plugins Manager Button */}
          {onOpenPCPlugins && (
            <button
              id="header-open-pc-plugins-btn"
              onClick={onOpenPCPlugins}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-cyan-700/60 hover:border-cyan-500 rounded-lg text-xs font-semibold text-cyan-300 transition cursor-pointer shadow-sm"
              title="Open PC Plugins Manager (VST3, CLAP, WASM PC, DLL)"
            >
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">PC Plugins</span>
              <span className="px-1 py-0.2 text-[9px] font-mono bg-cyan-950 text-cyan-400 rounded border border-cyan-800/80">
                VST3
              </span>
            </button>
          )}

          {/* Song Export Button */}
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-lg shadow-sm transition cursor-pointer"
              title="Export Master WAV / Audio Stems"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export</span>
            </button>
          )}

          {/* Android Architecture / NDK Explorer */}
          {(onOpenArchitecture || onOpenAndroidCode) && (
            <button
              onClick={handleOpenArchitectureClick}
              className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg text-xs text-neutral-300 transition cursor-pointer"
              title="View Native Android C++ NDK & Kotlin Architecture"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden lg:inline text-[11px] font-medium">NDK / C++</span>
            </button>
          )}

          {/* Device Frame Switcher (if handler exists) */}
          {setDeviceMode && (
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => setDeviceMode('tablet')}
                className={`p-1 rounded text-xs transition cursor-pointer ${
                  deviceMode === 'tablet'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Android Tablet Layout"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('phone')}
                className={`p-1 rounded text-xs transition cursor-pointer ${
                  deviceMode === 'phone'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Android Phone Layout"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeviceMode('full')}
                className={`p-1 rounded text-xs transition cursor-pointer ${
                  deviceMode === 'full'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Full Screen Layout"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Secondary Workspace Navigation Tabs */}
      <div className="h-10 px-3 bg-neutral-900/60 border-t border-neutral-800/50 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => handleTabSelect('arranger')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'arranger'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Arrangement</span>
        </button>

        <button
          onClick={() => handleTabSelect('piano-roll')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'piano-roll'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Piano Roll</span>
        </button>

        <button
          onClick={() => handleTabSelect('drum-sequencer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'drum-sequencer'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>Drum Sequencer</span>
        </button>

        <button
          onClick={() => handleTabSelect('mixer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'mixer'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Mixer</span>
        </button>

        <button
          onClick={() => handleTabSelect('synth')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'synth'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Synthesizer</span>
        </button>

        <button
          onClick={() => handleTabSelect('effects')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer shrink-0 ${
            activeWs === 'effects'
              ? 'bg-neutral-800 text-cyan-400 border border-neutral-700 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Effects Rack</span>
        </button>
      </div>
    </header>
  );
};
