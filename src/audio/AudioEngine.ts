import {
  Project,
  Track,
  MidiNote,
  SynthConfig,
  AnyEffectConfig,
  AudioClip,
  PocketPad,
} from '../types/daw';

export interface MeterData {
  left: number; // 0 to 1
  right: number; // 0 to 1
  peakDb: number;
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  public ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private isPlaying: boolean = false;
  private bpm: number = 130;
  private currentBeat: number = 0;
  private loopStartBeat: number = 0;
  private loopEndBeat: number = 16;
  private isLooping: boolean = true;
  private swing: number = 0;

  // Master Nodes
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterEffectsChain: AudioNode[] = [];

  // Track Node Maps
  private trackGains: Map<string, GainNode> = new Map();
  private trackPanners: Map<string, StereoPannerNode> = new Map();
  private trackAnalysers: Map<string, AnalyserNode> = new Map();
  private trackFxNodes: Map<string, AudioNode[]> = new Map();

  // Scheduler state
  private schedulerTimer: number | null = null;
  private nextBeatTime: number = 0;
  private scheduledBeat: number = 0;
  private activeVoices: Set<{ stop: (time: number) => void }> = new Set();
  private sampleBuffers = new Map<string, AudioBuffer>();
  private chokeVoices = new Map<number, { stop: (time?: number) => void }>();
  private pocketMidiListeners = new Set<(note:number,velocity:number)=>void>();

  // Project reference
  private project: Project | null = null;

  // Recording
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTrackId: string | null = null;
  private recordingStartBeat: number = 0;
  private isRecording: boolean = false;
  private micAnalyser: AnalyserNode | null = null;

  // Listeners
  private onBeatCallbacks: Set<(beat: number) => void> = new Set();
  private onStateChangeCallbacks: Set<(isPlaying: boolean) => void> = new Set();

  private constructor() {
    this.initMidi();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async initAudio(): Promise<boolean> {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // Awaiting user gesture
        }
      }
      return true;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // Will resume on play or audition
        }
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;

      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterAnalyser.smoothingTimeConstant = 0.8;

      this.masterGain.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);

      this.isRunning = true;

      // Immediately wire tracks and master effects if project is already provided
      if (this.project) {
        this.setupTracks(this.project.tracks);
        this.setupMasterEffects(this.project.masterEffects);
      }

      return true;
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
      return false;
    }
  }

  public async ensureAudioReady(): Promise<boolean> {
    const ok = await this.initAudio();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume awaiting user gesture:', err);
      }
    }
    if (this.project && this.ctx && this.masterGain) {
      if (this.trackGains.size === 0 && this.project.tracks.length > 0) {
        this.setupTracks(this.project.tracks);
      }
      if (this.masterEffectsChain.length === 0 && this.project.masterEffects.length > 0) {
        this.setupMasterEffects(this.project.masterEffects);
      }
    }
    return ok;
  }

  public setOnBeatCallback(cb: (beat: number) => void) {
    this.onBeatCallbacks.clear();
    this.onBeatCallbacks.add(cb);
  }

  public addOnBeatListener(cb: (beat: number) => void): () => void {
    this.onBeatCallbacks.add(cb);
    return () => this.onBeatCallbacks.delete(cb);
  }

  public setProject(project: Project) {
    this.project = project;
    this.bpm = project.settings.bpm;
    this.loopStartBeat = project.settings.loopStartBeat;
    this.loopEndBeat = project.settings.loopEndBeat;
    this.isLooping = project.settings.isLooping;
    this.swing = project.settings.swing;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(project.settings.masterVolume, this.ctx.currentTime);
    }
    if (this.ctx && this.masterGain) {
      this.setupTracks(project.tracks);
      this.setupMasterEffects(project.masterEffects);
    }
  }

  public setupMasterEffects(effects: AnyEffectConfig[]) {
    if (!this.ctx || !this.masterGain || !this.masterAnalyser) return;

    // Disconnect existing
    try {
      this.masterGain.disconnect();
    } catch {
      // ignore
    }

    const nodes = this.buildEffectsChain(this.ctx, effects);
    this.masterEffectsChain = nodes;

    if (nodes.length === 0) {
      this.masterGain.connect(this.masterAnalyser);
    } else {
      this.masterGain.connect(nodes[0]);
      nodes[nodes.length - 1].connect(this.masterAnalyser);
    }
    try {
      this.masterAnalyser.disconnect();
    } catch {
      // ignore
    }
    this.masterAnalyser.connect(this.ctx.destination);
  }

  public setupTracks(tracks: Track[]) {
    if (!this.ctx || !this.masterGain) return;

    tracks.forEach((track) => {
      let gain = this.trackGains.get(track.id);
      let panner = this.trackPanners.get(track.id);
      let analyser = this.trackAnalysers.get(track.id);

      if (!gain || !panner || !analyser) {
        gain = this.ctx!.createGain();
        panner = this.ctx!.createStereoPanner();
        analyser = this.ctx!.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;

        this.trackGains.set(track.id, gain);
        this.trackPanners.set(track.id, panner);
        this.trackAnalysers.set(track.id, analyser);
      }

      // Set volume and pan
      const effectiveGain = track.mute ? 0 : track.volume;
      gain.gain.setValueAtTime(effectiveGain, this.ctx!.currentTime);
      panner.pan.setValueAtTime(track.pan, this.ctx!.currentTime);

      // Reconnect effects
      const fxNodes = this.buildEffectsChain(this.ctx!, track.effects);
      this.trackFxNodes.set(track.id, fxNodes);

      try {
        gain.disconnect();
        panner.disconnect();
        analyser.disconnect();
      } catch {
        // ignore
      }

      if (fxNodes.length === 0) {
        gain.connect(panner);
      } else {
        gain.connect(fxNodes[0]);
        fxNodes[fxNodes.length - 1].connect(panner);
      }
      panner.connect(analyser);
      analyser.connect(this.masterGain!);
    });
  }

  public updateTrackControls(trackId: string, volume: number, pan: number, mute: boolean) {
    if (!this.ctx) return;
    const gain = this.trackGains.get(trackId);
    const panner = this.trackPanners.get(trackId);
    if (gain) {
      gain.gain.setValueAtTime(mute ? 0 : volume, this.ctx.currentTime);
    }
    if (panner) {
      panner.pan.setValueAtTime(pan, this.ctx.currentTime);
    }
  }

  public updateMasterVolume(vol: number) {
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
    }
  }

  public updateBpm(bpm: number) {
    this.bpm = bpm;
  }

  // Audition Helpers
  public async previewSynthNote(
    config: SynthConfig,
    pitch: number,
    velocity: number = 0.85,
    duration: number = 0.4
  ) {
    await this.ensureAudioReady();
    if (!this.ctx || !this.masterGain) return;
    this.playSynthNote(
      config,
      pitch,
      velocity,
      this.ctx.currentTime,
      duration,
      this.masterGain
    );
  }

  public async previewDrumSample(
    sampleId: string,
    volume: number = 0.9,
    pitchOffset: number = 0
  ) {
    await this.ensureAudioReady();
    if (!this.ctx || !this.masterGain) return;
    this.playDrumSample(
      sampleId,
      volume,
      this.ctx.currentTime,
      this.masterGain,
      pitchOffset
    );
  }

  public async loadPocketSample(id:string, source:Blob|string):Promise<AudioBuffer|null>{await this.ensureAudioReady();if(!this.ctx)return null;try{const ab=typeof source==='string'?await fetch(source).then(r=>r.arrayBuffer()):await source.arrayBuffer();const decoded=await this.ctx.decodeAudioData(ab.slice(0));this.sampleBuffers.set(id,decoded);return decoded}catch(e){console.warn('PocketBand sample decode failed',e);return null}}
  public onPocketMidi(cb:(note:number,velocity:number)=>void){this.pocketMidiListeners.add(cb);return()=>this.pocketMidiListeners.delete(cb)}
  public async playPocketPad(pad:PocketPad,velocity01:number,time?:number,destination?:AudioNode){await this.ensureAudioReady();if(!this.ctx||!this.masterGain)return;const now=time??this.ctx.currentTime;if(pad.sampleUrl&&!this.sampleBuffers.has(pad.sampleId))await this.loadPocketSample(pad.sampleId,pad.sampleUrl);const buffer=this.sampleBuffers.get(pad.sampleId);if(!buffer){this.playDrumSample(pad.sampleId,velocity01*pad.gain,now,destination||this.masterGain,pad.pitch);return}
    if(pad.chokeGroup>0){const old=this.chokeVoices.get(pad.chokeGroup);old?.stop(now)}
    const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),drive=this.ctx.createWaveShaper(),gain=this.ctx.createGain(),pan=this.ctx.createStereoPanner();source.buffer=buffer;source.playbackRate.value=Math.pow(2,pad.pitch/12);filter.type='lowpass';filter.frequency.value=Math.max(80,Math.min(20000,pad.fx.filterHz));filter.Q.value=pad.fx.resonance;const amount=Math.max(0,pad.fx.drive);if(amount>0){const curve=new Float32Array(256);for(let i=0;i<256;i++){const x=i*2/255-1;curve[i]=Math.tanh(x*(1+amount/12))}drive.curve=curve}else drive.curve=new Float32Array([-1,1]);gain.gain.value=Math.max(0,velocity01*pad.gain);pan.pan.value=Math.max(-1,Math.min(1,pad.pan));source.connect(filter);filter.connect(drive);drive.connect(gain);gain.connect(pan);pan.connect(destination||this.masterGain);const start=Math.max(0,Math.min(.999,pad.chopStart))*buffer.duration,end=Math.max(start+.001,Math.min(1,pad.chopEnd))*buffer.duration;source.start(now,start,Math.max(.001,end-start));const voice={stop:(t=0)=>{try{source.stop(t)}catch{}}};if(pad.chokeGroup>0)this.chokeVoices.set(pad.chokeGroup,voice);source.onended=()=>{if(this.chokeVoices.get(pad.chokeGroup)===voice)this.chokeVoices.delete(pad.chokeGroup)}}
  public schedulePocketRoll(pad:PocketPad,velocity01:number,division:string,durationBeats=1){if(!this.ctx)return;const denom=Number(division.split('/')[1]||16),beatStep=4/denom,seconds=(60/this.bpm)*beatStep,count=Math.max(1,Math.floor(durationBeats/beatStep));for(let i=0;i<count;i++)void this.playPocketPad(pad,velocity01,this.ctx.currentTime+i*seconds)}

  // --- TRANSPORT CONTROLS ---

  public async play() {
    await this.ensureAudioReady();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isPlaying = true;
    this.notifyStateChange();

    this.scheduledBeat = this.currentBeat;
    this.nextBeatTime = this.ctx.currentTime + 0.05;

    this.startScheduler();
  }

  public pause() {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopAllVoices();
    this.notifyStateChange();
  }

  public stop() {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopAllVoices();
    this.currentBeat = this.loopStartBeat;
    this.scheduledBeat = this.loopStartBeat;
    this.notifyBeat(this.currentBeat);
    this.notifyStateChange();
  }

  public seek(beat: number) {
    this.currentBeat = Math.max(0, beat);
    this.scheduledBeat = this.currentBeat;
    if (this.ctx) {
      this.nextBeatTime = this.ctx.currentTime + 0.02;
    }
    this.stopAllVoices();
    this.notifyBeat(this.currentBeat);
  }

  public togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentBeat(): number {
    return this.currentBeat;
  }

  // --- AUDIO SCHEDULER (Lookahead) ---

  private startScheduler() {
    this.stopScheduler();
    const intervalMs = 25; // 25ms tick
    const lookaheadSec = 0.1; // 100ms lookahead

    this.schedulerTimer = window.setInterval(() => {
      if (!this.ctx || !this.isPlaying || !this.project) return;

      const secondsPerBeat = 60 / this.bpm;

      while (this.nextBeatTime < this.ctx.currentTime + lookaheadSec) {
        this.scheduleBeat(this.scheduledBeat, this.nextBeatTime);

        // Advance 1/16th beat (0.25 beat)
        const step = 0.25;
        this.scheduledBeat += step;

        // Apply swing on off-beats
        const isOffBeat = Math.floor(this.scheduledBeat * 4) % 2 === 1;
        const swingOffset = isOffBeat ? (this.swing / 100) * 0.04 : 0;
        this.nextBeatTime += step * secondsPerBeat + swingOffset;

        // Handle Looping
        if (this.isLooping && this.scheduledBeat >= this.loopEndBeat) {
          this.scheduledBeat = this.loopStartBeat;
        }
      }

      // Update current beat for UI sync
      const elapsed = this.ctx.currentTime;
      this.currentBeat = this.scheduledBeat;
      this.notifyBeat(this.currentBeat);
    }, intervalMs);
  }

  private stopScheduler() {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleBeat(beat: number, time: number) {
    if (!this.project || !this.ctx) return;

    // Metronome audio click
    if (this.project.settings.metronome && Math.abs(beat - Math.round(beat)) < 0.08) {
      const quarterBeat = Math.round(beat);
      const isBarStart = quarterBeat % 4 === 0;
      this.playMetronomeClick(time, isBarStart);
    }

    // Schedule MIDI and Drum clips on each track
    this.project.tracks.forEach((track) => {
      if (track.mute) return;
      const trackGainNode = this.trackGains.get(track.id) || this.masterGain;
      if (!trackGainNode) return;

      track.clips.forEach((clip) => {
        if (beat >= clip.startBeat && beat < clip.startBeat + clip.durationBeats) {
          const beatInClip = beat - clip.startBeat;

          if (clip.type === 'midi' && clip.midiNotes && track.synthConfig) {
            clip.midiNotes.forEach((note) => {
              // Match within 1/16th step precision
              if (Math.abs(note.startTime - beatInClip) < 0.13) {
                const noteDurationSeconds = Math.max(0.05, (note.duration * 60) / this.bpm);
                this.playSynthNote(
                  track.synthConfig!,
                  note.pitch,
                  note.velocity / 127,
                  time,
                  noteDurationSeconds,
                  trackGainNode
                );
              }
            });
          } else if (clip.type === 'drum' && clip.drumPatternId) {
            const pattern = this.project?.drumPatterns.find(
              (p) => p.id === clip.drumPatternId
            );
            if (pattern) {
              const stepIndex = Math.floor((beatInClip * 4) % pattern.stepCount);
              pattern.lanes.forEach((lane) => {
                if (lane.mute) return;
                const step = lane.steps[stepIndex];
                if (step && step.active) {
                  // Probability check
                  if (Math.random() * 100 <= step.probability) {
                    this.playDrumSample(
                      lane.sampleId,
                      (step.velocity / 127) * lane.volume,
                      time,
                      trackGainNode,
                      step.pitchOffset || 0
                    );
                  }
                }
              });
            }
          }
        }
      });
    });
  }

  public playMetronomeClick(time: number, isBarStart: boolean) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isBarStart ? 1200 : 800, time);
      g.gain.setValueAtTime(0.25, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.05);
    } catch {
      // AudioContext state safety
    }
  }

  private stopAllVoices() {
    this.activeVoices.forEach((voice) => {
      try {
        voice.stop(0);
      } catch {
        // ignore
      }
    });
    this.activeVoices.clear();
  }

  // --- SYNTHESIZER ENGINE ---

  public playSynthNote(
    config: SynthConfig,
    pitch: number,
    velocity: number,
    time: number,
    durationSeconds: number,
    destination: AudioNode
  ) {
    if (!this.ctx) return;

    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    const now = time || this.ctx.currentTime;

    // Oscillators
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc1Gain = this.ctx.createGain();
    const osc2Gain = this.ctx.createGain();

    osc1.type = config.osc1.type === 'noise' ? 'sawtooth' : config.osc1.type;
    osc2.type = config.osc2.type === 'noise' ? 'square' : config.osc2.type;

    const osc1Freq = freq * Math.pow(2, config.osc1.octave + config.osc1.semitone / 12);
    const osc2Freq = freq * Math.pow(2, config.osc2.octave + config.osc2.semitone / 12);

    osc1.frequency.setValueAtTime(osc1Freq, now);
    osc2.frequency.setValueAtTime(osc2Freq, now);
    osc1.detune.setValueAtTime(config.osc1.detune, now);
    osc2.detune.setValueAtTime(config.osc2.detune, now);

    osc1Gain.gain.setValueAtTime((1 - config.mix) * config.osc1.gain, now);
    osc2Gain.gain.setValueAtTime(config.mix * config.osc2.gain, now);

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = config.filter.type;
    const baseCutoff = Math.max(20, Math.min(20000, config.filter.cutoff));
    filter.frequency.setValueAtTime(baseCutoff, now);
    filter.Q.setValueAtTime(config.filter.resonance, now);

    // Filter Envelope
    const fe = config.filterEnv;
    const targetCutoff = Math.max(
      40,
      Math.min(18000, baseCutoff + config.filter.envAmount * 8000)
    );
    filter.frequency.linearRampToValueAtTime(targetCutoff, now + Math.max(0.01, fe.attack));
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, baseCutoff + (targetCutoff - baseCutoff) * fe.sustain),
      now + fe.attack + fe.decay
    );

    // Amp Envelope
    const ampGain = this.ctx.createGain();
    const ae = config.ampEnv;
    const peakGain = velocity * 0.7;

    ampGain.gain.setValueAtTime(0.0001, now);
    ampGain.gain.linearRampToValueAtTime(peakGain, now + Math.max(0.005, ae.attack));
    ampGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peakGain * ae.sustain),
      now + ae.attack + ae.decay
    );

    const releaseStart = now + durationSeconds;
    ampGain.gain.setValueAtTime(
      Math.max(0.0001, peakGain * ae.sustain),
      releaseStart
    );
    ampGain.gain.exponentialRampToValueAtTime(
      0.0001,
      releaseStart + Math.max(0.02, ae.release)
    );

    // LFO
    if (config.lfo.depth > 0 && config.lfo.target !== 'none') {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(config.lfo.rate, now);

      if (config.lfo.target === 'filter') {
        lfoGain.gain.setValueAtTime(config.lfo.depth * 2000, now);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
      } else if (config.lfo.target === 'pitch') {
        lfoGain.gain.setValueAtTime(config.lfo.depth * 100, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.detune);
        lfoGain.connect(osc2.detune);
      }
      lfo.start(now);
      lfo.stop(releaseStart + ae.release + 0.1);
    }

    // Connections
    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    filter.connect(ampGain);
    ampGain.connect(destination);

    osc1.start(now);
    osc2.start(now);

    const stopTime = releaseStart + ae.release + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    const voice = {
      stop: (t: number) => {
        try {
          ampGain.gain.setValueAtTime(ampGain.gain.value, t);
          ampGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
          osc1.stop(t + 0.06);
          osc2.stop(t + 0.06);
        } catch {
          // ignore
        }
      },
    };

    this.activeVoices.add(voice);
    setTimeout(() => {
      this.activeVoices.delete(voice);
    }, (stopTime - this.ctx.currentTime) * 1000 + 100);
  }

  // --- DRUM SYNTHESIZER / SAMPLER ---

  public playDrumSample(
    sampleId: string,
    volume: number,
    time: number,
    destination: AudioNode,
    pitchOffset: number = 0
  ) {
    if (!this.ctx) return;
    const now = time || this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(destination);

    if (sampleId === 'kick') {
      // 808 Sub Kick: Sweeping sine + pitch drop
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const baseFreq = 150 * Math.pow(2, pitchOffset / 12);

      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.08);

      oscGain.gain.setValueAtTime(1.0, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(oscGain);
      oscGain.connect(gain);

      osc.start(now);
      osc.stop(now + 0.46);
    } else if (sampleId === 'snare') {
      // Snare: Tone + Filtered Noise
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.frequency.setValueAtTime(220 * Math.pow(2, pitchOffset / 12), now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(oscGain);
      oscGain.connect(gain);

      // Noise
      const noiseBuffer = this.createNoiseBuffer(0.2);
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.setValueAtTime(1000, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(gain);

      osc.start(now);
      noiseSource.start(now);
      osc.stop(now + 0.15);
      noiseSource.stop(now + 0.2);
    } else if (sampleId === 'hat_closed') {
      // Crisp 16th Hi-Hat
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(0.06);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7500, now);
      const hGain = this.ctx.createGain();
      hGain.gain.setValueAtTime(0.9, now);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      noise.connect(filter);
      filter.connect(hGain);
      hGain.connect(gain);

      noise.start(now);
      noise.stop(now + 0.06);
    } else if (sampleId === 'hat_open') {
      // Bright Open Hi-Hat
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(0.35);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6500, now);
      const hGain = this.ctx.createGain();
      hGain.gain.setValueAtTime(0.8, now);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      noise.connect(filter);
      filter.connect(hGain);
      hGain.connect(gain);

      noise.start(now);
      noise.stop(now + 0.35);
    } else if (sampleId === 'perc') {
      // Rimshot / Woodblock
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const pGain = this.ctx.createGain();
      osc.frequency.setValueAtTime(450 * Math.pow(2, pitchOffset / 12), now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.04);
      pGain.gain.setValueAtTime(0.8, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(pGain);
      pGain.connect(gain);

      osc.start(now);
      osc.stop(now + 0.09);
    } else if (sampleId === 'clap') {
      // 808/909 Triple Pre-burst Clustered Clap
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(0.24);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1150 * Math.pow(2, pitchOffset / 12), now);
      filter.Q.setValueAtTime(2.2, now);

      const cGain = this.ctx.createGain();
      cGain.gain.setValueAtTime(0.8, now);
      cGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      cGain.gain.setValueAtTime(0.7, now + 0.012);
      cGain.gain.exponentialRampToValueAtTime(0.08, now + 0.022);
      cGain.gain.setValueAtTime(0.9, now + 0.024);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      noise.connect(filter);
      filter.connect(cGain);
      cGain.connect(gain);

      noise.start(now);
      noise.stop(now + 0.24);
    } else {
      // Fallback drum percussion sound so no sampleId is ever silent
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.frequency.setValueAtTime(180 * Math.pow(2, pitchOffset / 12), now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);
      oscGain.gain.setValueAtTime(0.85, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  }

  private createNoiseBuffer(durationSeconds: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const bufferSize = Math.floor(this.ctx.sampleRate * durationSeconds);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- DSP EFFECTS CHAIN BUILDER ---

  private buildEffectsChain(ctx: BaseAudioContext, effects: AnyEffectConfig[]): AudioNode[] {
    const activeFx = (effects || []).filter((fx) => fx && fx.enabled);
    if (activeFx.length === 0) return [];

    interface FxBlock {
      input: AudioNode;
      output: AudioNode;
    }

    const blocks: FxBlock[] = [];

    activeFx.forEach((fx) => {
      try {
        if (fx.type === 'eq') {
          const low = ctx.createBiquadFilter();
          low.type = 'lowshelf';
          low.frequency.value = fx.lowFreq || 100;
          low.gain.value = fx.lowGain || 0;

          const mid = ctx.createBiquadFilter();
          mid.type = 'peaking';
          mid.frequency.value = fx.midFreq || 1000;
          mid.Q.value = fx.midQ || 1.0;
          mid.gain.value = fx.midGain || 0;

          const high = ctx.createBiquadFilter();
          high.type = 'highshelf';
          high.frequency.value = fx.highFreq || 8000;
          high.gain.value = fx.highGain || 0;

          low.connect(mid);
          mid.connect(high);

          blocks.push({ input: low, output: high });
        } else if (fx.type === 'compressor') {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = fx.threshold ?? -18;
          comp.ratio.value = fx.ratio ?? 3;
          comp.attack.value = fx.attack ?? 0.01;
          comp.release.value = fx.release ?? 0.25;

          const makeup = ctx.createGain();
          const gainFactor = Math.pow(10, (fx.makeupGain || 0) / 20);
          makeup.gain.value = gainFactor;
          comp.connect(makeup);

          blocks.push({ input: comp, output: makeup });
        } else if (fx.type === 'delay') {
          const inGain = ctx.createGain();
          const outGain = ctx.createGain();
          const dryGain = ctx.createGain();
          const wetGain = ctx.createGain();

          const wet = fx.wet !== undefined ? fx.wet : 0.35;
          dryGain.gain.value = Math.max(0, 1.0 - wet * 0.5);
          wetGain.gain.value = wet;

          const delay = ctx.createDelay(4.0);
          delay.delayTime.value = Math.max(0.01, Math.min(2.0, fx.time || 0.25));

          const feedback = ctx.createGain();
          feedback.gain.value = Math.max(0, Math.min(0.85, fx.feedback || 0.35));

          const damp = ctx.createBiquadFilter();
          damp.type = 'lowpass';
          damp.frequency.value = fx.filterDamp || 5000;

          inGain.connect(dryGain);
          inGain.connect(delay);

          delay.connect(damp);
          damp.connect(feedback);
          feedback.connect(delay);
          damp.connect(wetGain);

          dryGain.connect(outGain);
          wetGain.connect(outGain);

          blocks.push({ input: inGain, output: outGain });
        } else if (fx.type === 'reverb') {
          const inGain = ctx.createGain();
          const outGain = ctx.createGain();
          const dryGain = ctx.createGain();
          const wetGain = ctx.createGain();

          const wet = fx.wet !== undefined ? fx.wet : 0.3;
          dryGain.gain.value = Math.max(0, 1.0 - wet * 0.5);
          wetGain.gain.value = wet;

          const convolver = ctx.createConvolver();
          const decay = Math.max(0.2, Math.min(6.0, fx.decay || 2.0));
          convolver.buffer = this.buildReverbImpulse(ctx, decay, fx.damping || 0.25);

          inGain.connect(dryGain);
          inGain.connect(convolver);
          convolver.connect(wetGain);

          dryGain.connect(outGain);
          wetGain.connect(outGain);

          blocks.push({ input: inGain, output: outGain });
        } else if (fx.type === 'distortion') {
          const shaper = ctx.createWaveShaper();
          shaper.curve = this.createDistortionCurve(fx.drive || 20);
          shaper.oversample = '2x';
          blocks.push({ input: shaper, output: shaper });
        } else if (fx.type === 'chorus') {
          const inGain = ctx.createGain();
          const outGain = ctx.createGain();
          const dryGain = ctx.createGain();
          const wetGain = ctx.createGain();

          const wet = fx.wet !== undefined ? fx.wet : 0.4;
          dryGain.gain.value = Math.max(0, 1.0 - wet * 0.5);
          wetGain.gain.value = wet;

          const delay = ctx.createDelay(0.1);
          delay.delayTime.value = 0.025;

          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = fx.rate || 1.5;
          lfoGain.gain.value = 0.004 * (fx.depth || 0.5);

          lfo.connect(lfoGain);
          lfoGain.connect(delay.delayTime);
          lfo.start();

          inGain.connect(dryGain);
          inGain.connect(delay);
          delay.connect(wetGain);

          dryGain.connect(outGain);
          wetGain.connect(outGain);

          blocks.push({ input: inGain, output: outGain });
        } else if (fx.type === 'bitcrusher') {
          const shaper = ctx.createWaveShaper();
          shaper.curve = this.createBitcrusherCurve(fx.bits || 8);
          blocks.push({ input: shaper, output: shaper });
        } else if (fx.type === 'limiter') {
          const lim = ctx.createDynamicsCompressor();
          lim.threshold.value = fx.ceiling !== undefined ? fx.ceiling : -0.5;
          lim.ratio.value = 20;
          lim.attack.value = 0.002;
          lim.release.value = fx.release || 0.05;
          blocks.push({ input: lim, output: lim });
        }
      } catch (err) {
        console.warn('Error constructing effect block:', fx.type, err);
      }
    });

    if (blocks.length === 0) return [];

    // Link blocks sequentially: block[i].output -> block[i+1].input
    for (let i = 0; i < blocks.length - 1; i++) {
      blocks[i].output.connect(blocks[i + 1].input);
    }

    return [blocks[0].input, blocks[blocks.length - 1].output];
  }

  private buildReverbImpulse(
    ctx: BaseAudioContext,
    durationSec: number,
    damping: number
  ): AudioBuffer {
    const rate = ctx.sampleRate || 48000;
    const length = Math.floor(rate * durationSec);
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 1 + damping * 4);
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    return impulse;
  }

  private createBitcrusherCurve(bits: number): Float32Array {
    const steps = Math.pow(2, Math.max(2, Math.min(16, bits)));
    const samples = 2048;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
  }

  private createDistortionCurve(drive: number): Float32Array {
    const k = drive;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // --- AUDIO RECORDING (Microphone) ---

  public async startRecording(trackId: string): Promise<boolean> {
    try {
      await this.initAudio();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Audio recording not supported in this browser.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      this.recordingTrackId = trackId;
      this.recordingStartBeat = this.currentBeat;
      this.recordedChunks = [];

      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;

      // Start DAW playback simultaneously if not already playing
      if (!this.isPlaying) {
        this.play();
      }

      return true;
    } catch (err) {
      console.error('Error starting audio recording:', err);
      return false;
    }
  }

  public async stopRecording(): Promise<AudioClip | null> {
    if (!this.mediaRecorder || !this.isRecording) return null;

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(audioBlob);

        const durationBeats = Math.max(1, this.currentBeat - this.recordingStartBeat);

        const clip: AudioClip = {
          id: 'rec_' + Date.now(),
          name: 'Mic Recording ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          startBeat: this.recordingStartBeat,
          durationBeats: durationBeats,
          offsetSeconds: 0,
          audioBufferUrl: blobUrl,
          pitchShift: 0,
          gain: 1.0,
          isReversed: false,
        };

        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }

        this.isRecording = false;
        this.recordingTrackId = null;
        resolve(clip);
      };

      this.mediaRecorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  // --- METERS & ANALYSING ---

  public getMasterMeter(): MeterData {
    if (!this.masterAnalyser) {
      return { left: 0, right: 0, peakDb: -60 };
    }
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteTimeDomainData(data);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const val = (data[i] - 128) / 128;
      sum += val * val;
      if (Math.abs(val) > peak) peak = Math.abs(val);
    }
    const rms = Math.sqrt(sum / data.length);
    const peakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -60;

    return {
      left: Math.min(1, rms * 2.5),
      right: Math.min(1, peak * 1.5),
      peakDb: Math.round(peakDb * 10) / 10,
    };
  }

  public getTrackMeter(trackId: string): MeterData {
    const analyser = this.trackAnalysers.get(trackId);
    if (!analyser) {
      return { left: 0, right: 0, peakDb: -60 };
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);

    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const val = Math.abs((data[i] - 128) / 128);
      if (val > peak) peak = val;
    }
    const peakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -60;
    return {
      left: peak,
      right: peak,
      peakDb: Math.round(peakDb * 10) / 10,
    };
  }

  // --- MIDI SUPPORT ---

  private initMidi() {
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      navigator
        .requestMIDIAccess()
        .then((midiAccess) => {
          const inputs = midiAccess.inputs.values();
          for (const input of inputs) {
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
          }
          midiAccess.onstatechange = (e: unknown) => {
            const ev = e as { port: { type: string; state: string; onmidimessage: ((m: any) => void) | null } };
            if (ev.port.type === 'input' && ev.port.state === 'connected') {
              ev.port.onmidimessage = (m: any) => this.handleMidiMessage(m);
            }
          };
        })
        .catch(() => {
          // Web MIDI not permitted or unavailable
        });
    }
  }

  private handleMidiMessage(event: { data: Uint8Array | number[] }) {
    const [status, note, velocity] = event.data;
    const command = status >> 4;
    if (!this.project) return;

    // Route to first active instrument track
    const armedTrack =
      this.project.tracks.find((t) => t.armed && t.type === 'instrument') ||
      this.project.tracks.find((t) => t.type === 'instrument');

    if (command === 9 && velocity > 0 && this.project.pocketBand) { this.pocketMidiListeners.forEach(cb=>cb(note,velocity)); return; }

    if (!armedTrack || !armedTrack.synthConfig || !this.ctx) return;
    const dest = this.trackGains.get(armedTrack.id) || this.masterGain;
    if (!dest) return;

    if (command === 9 && velocity > 0) {
      // Note On
      this.playSynthNote(armedTrack.synthConfig, note, velocity / 127, this.ctx.currentTime, 0.5, dest);
    }
  }

  // --- FULL SONG / STEMS EXPORT TO WAV ---

  public async exportProjectWav(
    project: Project,
    options: {
      exportType: 'master' | 'stems';
      selectedTrackId?: string;
      sampleRate: number;
      bitDepth: 16 | 24;
      onProgress?: (progress: number) => void;
    }
  ): Promise<{ blob: Blob; fileName: string }> {
    const totalBeats = project.settings.loopEndBeat || 16;
    const durationSeconds = (totalBeats * 60) / project.settings.bpm + 2.0; // tail for reverb
    const sampleRate = options.sampleRate || 48000;

    if (options.onProgress) options.onProgress(10);

    const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * durationSeconds), sampleRate);

    // Setup offline master bus
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = project.settings.masterVolume;
    const masterFx = this.buildEffectsChain(offlineCtx, project.masterEffects);

    if (masterFx.length > 0) {
      masterGain.connect(masterFx[0]);
      masterFx[masterFx.length - 1].connect(offlineCtx.destination);
    } else {
      masterGain.connect(offlineCtx.destination);
    }

    if (options.onProgress) options.onProgress(25);

    // Render tracks
    const tracksToRender =
      options.exportType === 'stems' && options.selectedTrackId
        ? project.tracks.filter((t) => t.id === options.selectedTrackId)
        : project.tracks;

    tracksToRender.forEach((track) => {
      if (track.mute) return;

      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = track.volume;
      const trackPanner = offlineCtx.createStereoPanner();
      trackPanner.pan.value = track.pan;

      const trackFx = this.buildEffectsChain(offlineCtx, track.effects);
      if (trackFx.length > 0) {
        trackGain.connect(trackFx[0]);
        trackFx[trackFx.length - 1].connect(trackPanner);
      } else {
        trackGain.connect(trackPanner);
      }
      trackPanner.connect(masterGain);

      // Render clips
      track.clips.forEach((clip) => {
        const clipStartTime = (clip.startBeat * 60) / project.settings.bpm;

        if (clip.type === 'midi' && clip.midiNotes && track.synthConfig) {
          clip.midiNotes.forEach((note) => {
            const noteStartTime = clipStartTime + (note.startTime * 60) / project.settings.bpm;
            const noteDuration = (note.duration * 60) / project.settings.bpm;
            this.renderOfflineSynthNote(
              offlineCtx,
              track.synthConfig!,
              note.pitch,
              note.velocity / 127,
              noteStartTime,
              noteDuration,
              trackGain
            );
          });
        } else if (clip.type === 'drum' && clip.drumPatternId) {
          const pattern = project.drumPatterns.find((p) => p.id === clip.drumPatternId);
          if (pattern) {
            const stepDuration = 60 / project.settings.bpm / 4;
            const stepsInClip = Math.floor(clip.durationBeats * 4);

            for (let stepIdx = 0; stepIdx < stepsInClip; stepIdx++) {
              const patternStepIdx = stepIdx % pattern.stepCount;
              const stepTime = clipStartTime + stepIdx * stepDuration;

              pattern.lanes.forEach((lane) => {
                if (lane.mute) return;
                const step = lane.steps[patternStepIdx];
                if (step && step.active) {
                  this.renderOfflineDrumSample(
                    offlineCtx,
                    lane.sampleId,
                    (step.velocity / 127) * lane.volume,
                    stepTime,
                    trackGain,
                    step.pitchOffset || 0
                  );
                }
              });
            }
          }
        }
      });
    });

    if (options.onProgress) options.onProgress(50);

    const renderedBuffer = await offlineCtx.startRendering();

    if (options.onProgress) options.onProgress(85);

    const wavBlob = this.encodeWav(renderedBuffer, options.bitDepth);

    if (options.onProgress) options.onProgress(100);

    const suffix =
      options.exportType === 'stems' && options.selectedTrackId
        ? `_${tracksToRender[0]?.name.replace(/\s+/g, '_')}`
        : '_Master';
    const fileName = `${project.settings.name.replace(/\s+/g, '_')}${suffix}.wav`;

    return { blob: wavBlob, fileName };
  }

  private renderOfflineSynthNote(
    ctx: OfflineAudioContext,
    config: SynthConfig,
    pitch: number,
    velocity: number,
    startTime: number,
    durationSeconds: number,
    destination: AudioNode
  ) {
    const freq = 440 * Math.pow(2, (pitch - 69) / 12);
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();

    osc1.type = config.osc1.type === 'noise' ? 'sawtooth' : config.osc1.type;
    osc2.type = config.osc2.type === 'noise' ? 'square' : config.osc2.type;

    osc1.frequency.setValueAtTime(freq * Math.pow(2, config.osc1.octave), startTime);
    osc2.frequency.setValueAtTime(freq * Math.pow(2, config.osc2.octave), startTime);
    osc1.detune.setValueAtTime(config.osc1.detune, startTime);
    osc2.detune.setValueAtTime(config.osc2.detune, startTime);

    osc1Gain.gain.setValueAtTime((1 - config.mix) * config.osc1.gain, startTime);
    osc2Gain.gain.setValueAtTime(config.mix * config.osc2.gain, startTime);

    const filter = ctx.createBiquadFilter();
    filter.type = config.filter.type;
    filter.frequency.setValueAtTime(config.filter.cutoff, startTime);
    filter.Q.setValueAtTime(config.filter.resonance, startTime);

    const ampGain = ctx.createGain();
    const ae = config.ampEnv;
    const peak = velocity * 0.7;

    ampGain.gain.setValueAtTime(0.0001, startTime);
    ampGain.gain.linearRampToValueAtTime(peak, startTime + ae.attack);
    ampGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * ae.sustain),
      startTime + ae.attack + ae.decay
    );

    const releaseStart = startTime + durationSeconds;
    ampGain.gain.setValueAtTime(Math.max(0.0001, peak * ae.sustain), releaseStart);
    ampGain.gain.exponentialRampToValueAtTime(0.0001, releaseStart + ae.release);

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    filter.connect(ampGain);
    ampGain.connect(destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(releaseStart + ae.release + 0.05);
    osc2.stop(releaseStart + ae.release + 0.05);
  }

  private renderOfflineDrumSample(
    ctx: OfflineAudioContext,
    sampleId: string,
    volume: number,
    time: number,
    destination: AudioNode,
    pitchOffset: number
  ) {
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(destination);

    if (sampleId === 'kick') {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const baseFreq = 150 * Math.pow(2, pitchOffset / 12);
      osc.frequency.setValueAtTime(baseFreq, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);
      oscGain.gain.setValueAtTime(1.0, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start(time);
      osc.stop(time + 0.46);
    } else if (sampleId === 'snare') {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.frequency.setValueAtTime(220, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.06);
      oscGain.gain.setValueAtTime(0.7, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(oscGain);
      oscGain.connect(gain);
      osc.start(time);
      osc.stop(time + 0.15);
    } else if (sampleId.includes('hat')) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.setValueAtTime(8000, time);
      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(0.6, time);
      hGain.gain.exponentialRampToValueAtTime(0.001, time + (sampleId === 'hat_open' ? 0.3 : 0.05));
      osc.connect(f);
      f.connect(hGain);
      hGain.connect(gain);
      osc.start(time);
      osc.stop(time + 0.32);
    }
  }

  private encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const left = buffer.getChannelData(0);
    const right = numChannels > 1 ? buffer.getChannelData(1) : left;

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      if (bitDepth === 16) {
        const sL = Math.max(-1, Math.min(1, left[i]));
        const sR = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
        offset += 2;
        view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
        offset += 2;
      } else {
        // 24 bit
        const sL = Math.max(-1, Math.min(1, left[i]));
        const sR = Math.max(-1, Math.min(1, right[i]));
        const intL = sL < 0 ? sL * 0x800000 : sL * 0x7fffff;
        const intR = sR < 0 ? sR * 0x800000 : sR * 0x7fffff;

        view.setUint8(offset, intL & 0xff);
        view.setUint8(offset + 1, (intL >> 8) & 0xff);
        view.setUint8(offset + 2, (intL >> 16) & 0xff);
        offset += 3;

        view.setUint8(offset, intR & 0xff);
        view.setUint8(offset + 1, (intR >> 8) & 0xff);
        view.setUint8(offset + 2, (intR >> 16) & 0xff);
        offset += 3;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // --- LISTENERS ---

  public onBeat(cb: (beat: number) => void): () => void {
    this.onBeatCallbacks.add(cb);
    return () => this.onBeatCallbacks.delete(cb);
  }

  public onStateChange(cb: (isPlaying: boolean) => void): () => void {
    this.onStateChangeCallbacks.add(cb);
    return () => this.onStateChangeCallbacks.delete(cb);
  }

  private notifyBeat(beat: number) {
    this.onBeatCallbacks.forEach((cb) => cb(beat));
  }

  private notifyStateChange() {
    this.onStateChangeCallbacks.forEach((cb) => cb(this.isPlaying));
  }
}
