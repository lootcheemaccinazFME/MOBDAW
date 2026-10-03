export type TrackType = 'instrument' | 'audio' | 'drum' | 'bus' | 'master' | 'automation';

export interface AutomationPoint {
  id: string;
  time: number; // in beats or seconds
  value: number; // 0 to 1
  curve?: 'linear' | 'smooth' | 'step';
}

export interface AutomationLane {
  id: string;
  targetParameter: string; // e.g. 'volume', 'pan', 'filterCutoff', 'fx_reverb_wet'
  points: AutomationPoint[];
  enabled: boolean;
}

export interface MidiNote {
  id: string;
  pitch: number; // MIDI note number 0-127 (e.g. 60 = C4)
  startTime: number; // in beats
  duration: number; // in beats (e.g. 0.25 = 16th note, 1 = quarter note)
  velocity: number; // 0-127
}

export interface MidiPattern {
  id: string;
  name: string;
  notes: MidiNote[];
  lengthBeats: number;
}

export interface DrumStep {
  active: boolean;
  velocity: number; // 0 to 127
  probability: number; // 0 to 100%
  pitchOffset?: number; // semitones (-12 to +12)
}

export interface DrumLane {
  id: string;
  name: string;
  sampleId: string;
  steps: DrumStep[]; // 16 or 32 steps
  volume: number; // 0 to 1
  pan: number; // -1 to 1
  mute: boolean;
  solo: boolean;
}

export interface DrumPattern {
  id: string;
  name: string;
  lanes: DrumLane[];
  stepCount: 16 | 32;
  swing: number; // 0 to 100%
}

export interface AudioClip {
  id: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  offsetSeconds: number; // start offset in sample
  audioBufferUrl?: string; // blob url or preset name
  audioBuffer?: AudioBuffer;
  pitchShift: number; // semitones
  gain: number; // volume multiplier
  isReversed: boolean;
  color?: string;
}

export type WorkspaceView = 'arranger' | 'piano-roll' | 'drum-sequencer' | 'beatpad' | 'mixer' | 'synth' | 'effects';

export interface TrackClip {
  id: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  type: 'midi' | 'audio' | 'drum';
  midiNotes?: MidiNote[];
  drumPatternId?: string;
  audioClip?: AudioClip;
  audioBufferId?: string;
  color?: string;
}

export type OscillatorConfig = SynthOscillator;

export interface SynthOscillator {
  type: 'sine' | 'sawtooth' | 'square' | 'triangle' | 'noise';
  octave: number; // -2 to +2
  semitone: number; // -12 to +12
  detune: number; // -50 to +50 cents
  gain: number; // 0 to 1
}

export interface ADSRConfig {
  attack: number; // seconds
  decay: number; // seconds
  sustain: number; // level 0 to 1
  release: number; // seconds
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
  cutoff: number; // Hz (20 - 20000)
  resonance: number; // Q (0.1 - 20)
  envAmount: number; // -1 to 1
}

export interface LFOConfig {
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth';
  rate: number; // Hz (0.1 - 20)
  depth: number; // 0 to 1
  target: 'none' | 'pitch' | 'filter' | 'volume' | 'pan';
}

export interface SynthConfig {
  osc1: SynthOscillator;
  osc2: SynthOscillator;
  mix: number; // 0 (osc1) to 1 (osc2)
  filter: FilterConfig;
  ampEnv: ADSRConfig;
  filterEnv: ADSRConfig;
  lfo: LFOConfig;
  glide: number; // seconds
  polyphony: number;
}

export interface SamplerConfig {
  sampleName: string;
  sampleUrl?: string;
  startPoint: number; // 0 to 1
  endPoint: number; // 0 to 1
  loop: boolean;
  reversed: boolean;
  pitch: number; // semitones
  rootKey: number; // MIDI key
  ampEnv: ADSRConfig;
}

export type EffectType =
  | 'eq'
  | 'compressor'
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'chorus'
  | 'bitcrusher'
  | 'limiter';

export interface EQEffectConfig {
  type: 'eq';
  enabled: boolean;
  lowGain: number; // dB (-18 to +18)
  lowFreq: number; // Hz
  midGain: number; // dB
  midFreq: number; // Hz
  midQ: number; // 0.1 to 10
  highGain: number; // dB
  highFreq: number; // Hz
}

export interface CompressorEffectConfig {
  type: 'compressor';
  enabled: boolean;
  threshold: number; // dB (-60 to 0)
  ratio: number; // 1 to 20
  attack: number; // seconds (0.001 to 0.5)
  release: number; // seconds (0.01 to 1)
  makeupGain: number; // dB (0 to 24)
}

export interface ReverbEffectConfig {
  type: 'reverb';
  enabled: boolean;
  decay: number; // seconds (0.1 to 10)
  roomSize: number; // 0 to 1
  damping: number; // 0 to 1
  wet: number; // 0 to 1
}

export interface DelayEffectConfig {
  type: 'delay';
  enabled: boolean;
  time: number; // seconds (0.01 to 1) or beat fraction
  feedback: number; // 0 to 0.95
  pingPong: boolean;
  filterDamp: number; // Hz (lowpass on feedback)
  wet: number; // 0 to 1
}

export interface DistortionEffectConfig {
  type: 'distortion';
  enabled: boolean;
  drive: number; // 0 to 100
  tone: number; // 0 to 1 (cutoff)
  mode: 'soft' | 'hard' | 'fuzz' | 'tube';
  wet: number;
}

export interface ChorusEffectConfig {
  type: 'chorus';
  enabled: boolean;
  rate: number; // Hz (0.1 to 8)
  depth: number; // 0 to 1
  feedback: number; // 0 to 0.8
  wet: number;
}

export interface BitcrusherEffectConfig {
  type: 'bitcrusher';
  enabled: boolean;
  bits: number; // 2 to 16
  downsample: number; // 1 to 32
  wet: number;
}

export interface LimiterEffectConfig {
  type: 'limiter';
  enabled: boolean;
  ceiling: number; // dB (-12 to 0)
  release: number; // seconds
}

export type AnyEffectConfig =
  | EQEffectConfig
  | CompressorEffectConfig
  | ReverbEffectConfig
  | DelayEffectConfig
  | DistortionEffectConfig
  | ChorusEffectConfig
  | BitcrusherEffectConfig
  | LimiterEffectConfig;

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // 0 to 1.2 (1.0 = 0dB)
  pan: number; // -1 (L) to +1 (R)
  mute: boolean;
  solo: boolean;
  armed: boolean;
  outputBusId?: string; // e.g. 'master' or bus track id
  clips: TrackClip[];
  effects: AnyEffectConfig[];
  synthConfig?: SynthConfig;
  samplerConfig?: SamplerConfig;
  automationLanes: AutomationLane[];
}

export interface ProjectSettings {
  id: string;
  name: string;
  bpm: number;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  swing: number; // 0 - 100
  loopStartBeat: number;
  loopEndBeat: number;
  isLooping: boolean;
  metronome?: boolean;
  sampleRate: number;
  masterVolume: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  settings: ProjectSettings;
  tracks: Track[];
  drumPatterns: DrumPattern[];
  masterEffects: AnyEffectConfig[];
}

export interface SoundPack {
  id: string;
  name: string;
  category: 'drums' | 'synth_presets' | 'acoustic' | 'vocals';
  sizeMb: number;
  isInstalled: boolean;
  downloadProgress?: number;
  description: string;
  sampleCount: number;
}

export interface PluginParamDef {
  id: string;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  value: number;
  unit: string;
  step?: number;
}

export type PCPluginFormat = 'vst3' | 'clap' | 'au' | 'wasm_pc' | 'dll';

export interface AuraPluginDescriptor {
  id: string;
  name: string;
  vendor: string;
  version: string;
  category: 'effect' | 'instrument' | 'dynamics' | 'reverb' | 'synth';
  format?: PCPluginFormat;
  description: string;
  isSandboxed: boolean;
  cpuUsagePct: number;
  latencySamples?: number;
  parameters?: PluginParamDef[];
  assignedTrackId?: string; // 'master' or track ID
  enabled?: boolean;
  dllPath?: string;
  dspAlgorithm?: string;
  presets?: { name: string; params: Record<string, number> }[];
}
