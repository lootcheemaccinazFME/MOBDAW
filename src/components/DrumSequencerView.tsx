import React, { useState } from 'react';
import {
  Grid3X3,
  Volume2,
  Trash2,
  Sparkles,
  Sliders,
  Copy,
  Zap,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Project, DrumPattern, DrumLane, DrumStep } from '../types/daw';
import { AudioEngine } from '../audio/AudioEngine';

interface DrumSequencerViewProps {
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project) => void;
  currentBeat: number;
}

export const DrumSequencerView: React.FC<DrumSequencerViewProps> = ({
  project,
  onUpdateProject,
  currentBeat,
}) => {
  const engine = AudioEngine.getInstance();
  const pattern = project.drumPatterns[0];

  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string>(pattern?.lanes[0]?.id || '');
  const [velocityEditStep, setVelocityEditStep] = useState<{ laneId: string; stepIdx: number } | null>(null);

  if (!pattern) {
    return <div className="p-4 text-neutral-400">No drum pattern loaded.</div>;
  }

  // Calculate which 16th step is currently playing (0 to 15 or 31)
  const activePlayheadStep = Math.floor((currentBeat * 4) % pattern.stepCount);

  // Trigger drum sample sound for auditioning
  const triggerSample = (sampleId: string) => {
    engine.previewDrumSample(sampleId, 0.9);
  };

  // Toggle Step Active/Inactive
  const handleToggleStep = (laneId: string, stepIdx: number) => {
    onUpdateProject((prev) => {
      const updatedPatterns = prev.drumPatterns.map((p) => {
        if (p.id !== pattern.id) return p;
        const updatedLanes = p.lanes.map((lane) => {
          if (lane.id !== laneId) return lane;
          const updatedSteps = [...lane.steps];
          const cur = updatedSteps[stepIdx];
          updatedSteps[stepIdx] = {
            ...cur,
            active: !cur.active,
          };
          return { ...lane, steps: updatedSteps };
        });
        return { ...p, lanes: updatedLanes };
      });
      const updated = { ...prev, drumPatterns: updatedPatterns };
      engine.setProject(updated);
      return updated;
    });

    const lane = pattern.lanes.find((l) => l.id === laneId);
    if (lane && !lane.steps[stepIdx].active) {
      triggerSample(lane.sampleId);
    }
  };

  // Change step count (16 or 32)
  const handleToggleStepCount = () => {
    const nextCount = pattern.stepCount === 16 ? 32 : 16;
    onUpdateProject((prev) => {
      const updatedPatterns = prev.drumPatterns.map((p) => {
        if (p.id !== pattern.id) return p;
        const updatedLanes = p.lanes.map((lane) => {
          let steps = [...lane.steps];
          if (nextCount === 32 && steps.length < 32) {
            // Duplicate first 16 steps into next 16
            steps = [...steps, ...steps.map((s) => ({ ...s }))];
          } else if (nextCount === 16) {
            steps = steps.slice(0, 16);
          }
          return { ...lane, steps };
        });
        return { ...p, stepCount: nextCount, lanes: updatedLanes };
      });
      const updated = { ...prev, drumPatterns: updatedPatterns };
      engine.setProject(updated);
      return updated;
    });
  };

  // Fill helpers (e.g. fill every 2 steps for hi-hat, 4 steps for kick)
  const handleFillLane = (laneId: string, stepInterval: number) => {
    onUpdateProject((prev) => {
      const updatedPatterns = prev.drumPatterns.map((p) => {
        if (p.id !== pattern.id) return p;
        const updatedLanes = p.lanes.map((lane) => {
          if (lane.id !== laneId) return lane;
          const updatedSteps = lane.steps.map((step, idx) => ({
            ...step,
            active: idx % stepInterval === 0,
          }));
          return { ...lane, steps: updatedSteps };
        });
        return { ...p, lanes: updatedLanes };
      });
      const updated = { ...prev, drumPatterns: updatedPatterns };
      engine.setProject(updated);
      return updated;
    });
  };

  const handleClearLane = (laneId: string) => {
    onUpdateProject((prev) => {
      const updatedPatterns = prev.drumPatterns.map((p) => {
        if (p.id !== pattern.id) return p;
        const updatedLanes = p.lanes.map((lane) => {
          if (lane.id !== laneId) return lane;
          const updatedSteps = lane.steps.map((step) => ({
            ...step,
            active: false,
          }));
          return { ...lane, steps: updatedSteps };
        });
        return { ...p, lanes: updatedLanes };
      });
      const updated = { ...prev, drumPatterns: updatedPatterns };
      engine.setProject(updated);
      return updated;
    });
  };

  // Presets
  const applyPreset = (presetName: 'trap' | 'boombap' | 'drill' | 'lofi') => {
    onUpdateProject((prev) => {
      const updatedPatterns = prev.drumPatterns.map((p) => {
        if (p.id !== pattern.id) return p;
        const updatedLanes = p.lanes.map((lane) => {
          const steps: DrumStep[] = Array.from({ length: p.stepCount }).map(() => ({
            active: false,
            velocity: 100,
            probability: 100,
          }));

          if (presetName === 'trap') {
            if (lane.sampleId === 'kick') {
              [0, 6, 10, 15].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'snare') {
              [4, 12].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'hat_closed') {
              steps.forEach((s) => (s.active = true)); // rolling 16ths
            } else if (lane.sampleId === 'hat_open') {
              [2, 10, 14].forEach((i) => (steps[i].active = true));
            }
          } else if (presetName === 'boombap') {
            if (lane.sampleId === 'kick') {
              [0, 3, 8, 11].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'snare') {
              [4, 12].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'hat_closed') {
              [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => (steps[i].active = true)); // 8ths
            }
          } else if (presetName === 'lofi') {
            if (lane.sampleId === 'kick') {
              [0, 7, 10].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'snare') {
              [4, 12].forEach((i) => (steps[i].active = true));
            } else if (lane.sampleId === 'hat_closed') {
              [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => {
                steps[i].active = true;
                steps[i].velocity = 80;
              });
            }
          }
          return { ...lane, steps };
        });
        return { ...p, lanes: updatedLanes };
      });
      const updated = { ...prev, drumPatterns: updatedPatterns };
      engine.setProject(updated);
      return updated;
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-200">
      {/* Top Sequencer Controls Header */}
      <div className="h-12 bg-neutral-900 border-b border-neutral-800 px-3 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
        {/* Preset Groove Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
            Presets:
          </span>
          <button
            onClick={() => applyPreset('trap')}
            className="px-2 py-1 bg-neutral-950 hover:bg-rose-950 hover:text-rose-300 text-xs rounded border border-neutral-800 transition cursor-pointer font-medium"
          >
            Metro Trap
          </button>
          <button
            onClick={() => applyPreset('boombap')}
            className="px-2 py-1 bg-neutral-950 hover:bg-amber-950 hover:text-amber-300 text-xs rounded border border-neutral-800 transition cursor-pointer font-medium"
          >
            90s Boom Bap
          </button>
          <button
            onClick={() => applyPreset('lofi')}
            className="px-2 py-1 bg-neutral-950 hover:bg-cyan-950 hover:text-cyan-300 text-xs rounded border border-neutral-800 transition cursor-pointer font-medium"
          >
            Lo-Fi Dust
          </button>
        </div>

        {/* Step Mode Toggle (16 or 32) & Swing */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStepCount}
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded border border-neutral-700 transition cursor-pointer"
          >
            {pattern.stepCount} Steps
          </button>

          {/* Swing Slider */}
          <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs">
            <span className="text-[10px] text-neutral-500 font-bold">SWING:</span>
            <input
              type="range"
              min="0"
              max="75"
              value={pattern.swing}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                onUpdateProject((prev) => {
                  const updated = {
                    ...prev,
                    drumPatterns: prev.drumPatterns.map((p) =>
                      p.id === pattern.id ? { ...p, swing: val } : p
                    ),
                  };
                  engine.setProject(updated);
                  return updated;
                });
              }}
              className="w-16 h-1 accent-rose-500 bg-neutral-800 rounded appearance-none cursor-pointer"
            />
            <span className="font-mono text-xs text-rose-400 font-bold">{pattern.swing}%</span>
          </div>
        </div>
      </div>

      {/* Sequencer Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-3">
        <div className="min-w-[700px] flex flex-col gap-2">
          {/* Beat indicator bar on top */}
          <div className="flex items-center gap-2 pl-44 pr-2">
            <div className="flex-1 grid grid-cols-16 gap-1">
              {Array.from({ length: pattern.stepCount }).map((_, stepIdx) => (
                <div
                  key={stepIdx}
                  className={`h-4 rounded flex items-center justify-center text-[8px] font-mono font-bold transition-colors ${
                    activePlayheadStep === stepIdx
                      ? 'bg-rose-500 text-neutral-950 ring-2 ring-rose-300'
                      : stepIdx % 4 === 0
                      ? 'bg-neutral-800 text-neutral-300'
                      : 'bg-neutral-900/60 text-neutral-600'
                  }`}
                >
                  {stepIdx + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Drum Lanes */}
          {pattern.lanes.map((lane) => (
            <div
              key={lane.id}
              className="flex items-center gap-2 bg-neutral-900/70 border border-neutral-800/80 rounded-xl p-2 hover:border-neutral-700 transition"
            >
              {/* Left Drum Pad / Audition Trigger */}
              <div className="w-40 flex items-center justify-between gap-1 shrink-0">
                <button
                  onClick={() => triggerSample(lane.sampleId)}
                  className="flex-1 h-10 px-2 rounded-lg bg-gradient-to-r from-neutral-800 to-neutral-850 hover:from-rose-950 hover:to-neutral-900 border border-neutral-700/80 active:scale-95 transition flex items-center gap-2 cursor-pointer shadow-sm text-left group"
                >
                  <div className="w-3 h-3 rounded-full bg-rose-500/80 group-hover:scale-125 transition" />
                  <span className="text-xs font-bold text-neutral-200 truncate">
                    {lane.name}
                  </span>
                </button>

                {/* Quick lane helpers */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleFillLane(lane.id, 2)}
                    className="p-1 hover:bg-neutral-800 rounded text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
                    title="Fill every 2 steps"
                  >
                    /2
                  </button>
                  <button
                    onClick={() => handleFillLane(lane.id, 4)}
                    className="p-1 hover:bg-neutral-800 rounded text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
                    title="Fill every 4 steps"
                  >
                    /4
                  </button>
                  <button
                    onClick={() => handleClearLane(lane.id)}
                    className="p-1 hover:bg-neutral-800 rounded text-neutral-600 hover:text-rose-400"
                    title="Clear lane"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Steps LED Buttons */}
              <div
                className="flex-1 grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${pattern.stepCount}, minmax(0, 1fr))`,
                }}
              >
                {lane.steps.map((step, stepIdx) => {
                  const isBeatStart = stepIdx % 4 === 0;
                  const isCurrent = activePlayheadStep === stepIdx;

                  return (
                    <button
                      key={stepIdx}
                      onClick={() => handleToggleStep(lane.id, stepIdx)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setVelocityEditStep({ laneId: lane.id, stepIdx });
                      }}
                      className={`h-11 rounded-md border flex flex-col items-center justify-between p-1 transition cursor-pointer ${
                        step.active
                          ? 'bg-gradient-to-t from-rose-600 to-rose-500 border-rose-400 text-white shadow-md shadow-rose-600/30'
                          : isBeatStart
                          ? 'bg-neutral-850 border-neutral-700/60 hover:border-neutral-600'
                          : 'bg-neutral-900 border-neutral-800/80 hover:border-neutral-700'
                      } ${isCurrent ? 'ring-2 ring-rose-400' : ''}`}
                    >
                      {/* Step Indicator Dot */}
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          step.active ? 'bg-white' : isCurrent ? 'bg-rose-400' : 'bg-neutral-700'
                        }`}
                      />

                      {/* Velocity bar at bottom of step */}
                      {step.active && (
                        <div className="w-full h-1 bg-black/40 rounded-xs overflow-hidden">
                          <div
                            className="h-full bg-white/80"
                            style={{ width: `${(step.velocity / 127) * 100}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Velocity Modal Popover for Fine-Tuning */}
      {velocityEditStep && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 w-80 shadow-2xl">
            <h4 className="text-sm font-bold text-neutral-200 mb-3 flex items-center justify-between">
              <span>Step Velocity & Probability</span>
              <button
                onClick={() => setVelocityEditStep(null)}
                className="text-neutral-500 hover:text-white"
              >
                ✕
              </button>
            </h4>

            {(() => {
              const lane = pattern.lanes.find((l) => l.id === velocityEditStep.laneId);
              const step = lane?.steps[velocityEditStep.stepIdx];
              if (!step) return null;

              return (
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="flex justify-between text-xs text-neutral-400 mb-1">
                      <span>Velocity:</span>
                      <span className="font-bold text-rose-400">{step.velocity}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="127"
                      value={step.velocity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        onUpdateProject((prev) => {
                          const updatedPatterns = prev.drumPatterns.map((p) => {
                            if (p.id !== pattern.id) return p;
                            const lanes = p.lanes.map((l) => {
                              if (l.id !== velocityEditStep.laneId) return l;
                              const steps = [...l.steps];
                              steps[velocityEditStep.stepIdx] = {
                                ...steps[velocityEditStep.stepIdx],
                                velocity: val,
                              };
                              return { ...l, steps };
                            });
                            return { ...p, lanes };
                          });
                          return { ...prev, drumPatterns: updatedPatterns };
                        });
                      }}
                      className="w-full accent-rose-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-neutral-400 mb-1">
                      <span>Probability:</span>
                      <span className="font-bold text-rose-400">{step.probability}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={step.probability}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        onUpdateProject((prev) => {
                          const updatedPatterns = prev.drumPatterns.map((p) => {
                            if (p.id !== pattern.id) return p;
                            const lanes = p.lanes.map((l) => {
                              if (l.id !== velocityEditStep.laneId) return l;
                              const steps = [...l.steps];
                              steps[velocityEditStep.stepIdx] = {
                                ...steps[velocityEditStep.stepIdx],
                                probability: val,
                              };
                              return { ...l, steps };
                            });
                            return { ...p, lanes };
                          });
                          return { ...prev, drumPatterns: updatedPatterns };
                        });
                      }}
                      className="w-full accent-rose-500"
                    />
                  </div>

                  <button
                    onClick={() => setVelocityEditStep(null)}
                    className="mt-2 w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition"
                  >
                    Done
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
