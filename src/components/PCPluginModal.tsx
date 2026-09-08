import React, { useState } from 'react';
import {
  X,
  Sliders,
  PlusCircle,
  Cpu,
  Download,
  Power,
  UploadCloud,
  CheckCircle,
  HardDrive,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AuraPluginDescriptor, PluginParamDef, PCPluginFormat, Project } from '../types/daw';
import { DEFAULT_PC_PLUGINS, AVAILABLE_PC_PLUGIN_REGISTRY } from '../data/pcPlugins';

interface PCPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onUpdateProject: (updater: (prev: Project) => Project, description?: string) => void;
}

export const PCPluginModal: React.FC<PCPluginModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'add' | 'architecture'>('active');
  const [plugins, setPlugins] = useState<AuraPluginDescriptor[]>(() => {
    try {
      const saved = localStorage.getItem('aura_pc_plugins');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_PC_PLUGINS;
  });

  const [selectedPluginId, setSelectedPluginId] = useState<string>(
    DEFAULT_PC_PLUGINS[0]?.id || ''
  );

  // New Custom Plugin Form State
  const [customName, setCustomName] = useState('');
  const [customVendor, setCustomVendor] = useState('Custom Audio DSP');
  const [customFormat, setCustomFormat] = useState<PCPluginFormat>('vst3');
  const [customCategory, setCustomCategory] = useState<'effect' | 'dynamics' | 'reverb' | 'synth'>('effect');
  const [customEngine, setCustomEngine] = useState('Analog Preamp Triode Clipping');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId) || plugins[0];

  const savePlugins = (updated: AuraPluginDescriptor[]) => {
    setPlugins(updated);
    try {
      localStorage.setItem('aura_pc_plugins', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Toggle Bypass
  const handleToggleBypass = (pluginId: string) => {
    const updated = plugins.map((p) => {
      if (p.id !== pluginId) return p;
      return { ...p, enabled: !p.enabled };
    });
    savePlugins(updated);
    onUpdateProject((prev) => ({ ...prev }), `Toggle PC Plugin: ${selectedPlugin?.name || ''}`);
  };

  // Assign Plugin to Track or Master
  const handleAssignTrack = (pluginId: string, targetTrackId: string) => {
    const updated = plugins.map((p) => {
      if (p.id !== pluginId) return p;
      return { ...p, assignedTrackId: targetTrackId };
    });
    savePlugins(updated);
    onUpdateProject(
      (prev) => ({ ...prev }),
      `Route PC Plugin to ${targetTrackId === 'master' ? 'Master' : 'Track'}`
    );
  };

  // Update Parameter Value
  const handleParamChange = (pluginId: string, paramId: string, val: number) => {
    const updated = plugins.map((p) => {
      if (p.id !== pluginId || !p.parameters) return p;
      const updatedParams = p.parameters.map((param) => {
        if (param.id !== paramId) return param;
        return { ...param, value: val };
      });
      return { ...p, parameters: updatedParams };
    });
    savePlugins(updated);
    onUpdateProject((prev) => ({ ...prev }), `Update PC Plugin Parameter`, {
      debounceTimeMs: 250,
    } as unknown as string);
  };

  // Apply Preset
  const handleApplyPreset = (pluginId: string, presetName: string) => {
    const plugin = plugins.find((p) => p.id === pluginId);
    if (!plugin || !plugin.presets || !plugin.parameters) return;
    const preset = plugin.presets.find((pr) => pr.name === presetName);
    if (!preset) return;

    const updated = plugins.map((p) => {
      if (p.id !== pluginId || !p.parameters) return p;
      const updatedParams = p.parameters.map((param) => {
        if (preset.params[param.id] !== undefined) {
          return { ...param, value: preset.params[param.id] };
        }
        return param;
      });
      return { ...p, parameters: updatedParams };
    });
    savePlugins(updated);
    onUpdateProject((prev) => ({ ...prev }), `Apply Preset: ${presetName}`);
  };

  // Add Plugin from Registry
  const handleInstallFromRegistry = (descriptor: AuraPluginDescriptor) => {
    if (plugins.some((p) => p.id === descriptor.id)) {
      setSelectedPluginId(descriptor.id);
      setActiveTab('active');
      return;
    }
    const newPlugin: AuraPluginDescriptor = {
      ...descriptor,
      enabled: true,
      assignedTrackId: 'master',
    };
    const updated = [...plugins, newPlugin];
    savePlugins(updated);
    setSelectedPluginId(newPlugin.id);
    setActiveTab('active');
    onUpdateProject((prev) => ({ ...prev }), `Add PC Plugin: ${descriptor.name}`);
  };

  // Create Custom Plugin
  const handleCreateCustomPlugin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const newId = `pc.custom.${Date.now()}`;
    const defaultParams: PluginParamDef[] = [
      { id: 'drive', name: 'Drive / Intensity', min: 0, max: 100, defaultValue: 45, value: 45, unit: '%' },
      { id: 'freq', name: 'Filter Cutoff', min: 20, max: 20000, defaultValue: 4500, value: 4500, unit: 'Hz' },
      { id: 'mix', name: 'Wet / Dry Mix', min: 0, max: 100, defaultValue: 80, value: 80, unit: '%' },
      { id: 'output', name: 'Output Trim', min: -12, max: 12, defaultValue: 0, value: 0, unit: 'dB' },
    ];

    const newDescriptor: AuraPluginDescriptor = {
      id: newId,
      name: customName.trim(),
      vendor: customVendor.trim() || 'Custom DSP Labs',
      version: '1.0.0 (' + customFormat.toUpperCase() + ')',
      category: customCategory,
      format: customFormat,
      description: `Custom ported ${customFormat.toUpperCase()} plugin utilizing ${customEngine}.`,
      isSandboxed: true,
      cpuUsagePct: 1.8,
      latencySamples: customFormat === 'vst3' ? 64 : 0,
      enabled: true,
      assignedTrackId: 'master',
      dspAlgorithm: customEngine,
      parameters: defaultParams,
      presets: [
        { name: 'Default State', params: { drive: 45, freq: 4500, mix: 80, output: 0 } },
        { name: 'Aggressive Boost', params: { drive: 85, freq: 12000, mix: 100, output: 2 } },
      ],
    };

    const updated = [...plugins, newDescriptor];
    savePlugins(updated);
    setSelectedPluginId(newId);
    setCustomName('');
    setActiveTab('active');
    onUpdateProject((prev) => ({ ...prev }), `Create PC Plugin: ${newDescriptor.name}`);
  };

  // Handle File Upload Simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(`Analyzing binary manifest for ${file.name}...`);
    setTimeout(() => {
      const fileNameClean = file.name.replace(/\.[^/.]+$/, '');
      const formatExt: PCPluginFormat = file.name.endsWith('.clap')
        ? 'clap'
        : file.name.endsWith('.dll')
        ? 'dll'
        : file.name.endsWith('.wasm')
        ? 'wasm_pc'
        : 'vst3';

      const imported: AuraPluginDescriptor = {
        id: `pc.imported.${Date.now()}`,
        name: fileNameClean || 'Imported PC Plugin',
        vendor: 'Third-Party PC Vendor',
        version: '2.0.0 (' + formatExt.toUpperCase() + ')',
        category: 'effect',
        format: formatExt,
        description: `Imported binary component (${file.name}) sandboxed in SIMD WASM container.`,
        isSandboxed: true,
        cpuUsagePct: 2.1,
        latencySamples: 64,
        enabled: true,
        assignedTrackId: 'master',
        dspAlgorithm: 'Ported x64 Native DSP Kernel',
        parameters: [
          { id: 'input_gain', name: 'Input Gain', min: -18, max: 18, defaultValue: 0, value: 0, unit: 'dB' },
          { id: 'intensity', name: 'Processing Intensity', min: 0, max: 100, defaultValue: 50, value: 50, unit: '%' },
          { id: 'wet_mix', name: 'Wet / Dry Balance', min: 0, max: 100, defaultValue: 100, value: 100, unit: '%' },
        ],
        presets: [
          { name: 'Factory Standard', params: { input_gain: 0, intensity: 50, wet_mix: 100 } },
        ],
      };

      const updated = [...plugins, imported];
      savePlugins(updated);
      setSelectedPluginId(imported.id);
      setImportStatus(`Successfully loaded and sandboxed ${file.name}!`);
      setTimeout(() => {
        setImportStatus(null);
        setActiveTab('active');
      }, 1200);
      onUpdateProject((prev) => ({ ...prev }), `Import PC Plugin: ${imported.name}`);
    }, 800);
  };

  return (
    <div
      id="pc-plugins-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4"
    >
      <div
        id="pc-plugins-modal-container"
        className="flex flex-col w-full max-w-5xl h-[92vh] max-h-[820px] bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-950/90 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-600/40 flex items-center justify-center text-cyan-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-100 tracking-wide">
                  PC Plugin Manager & DSP Bridge
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-cyan-950/90 text-cyan-400 border border-cyan-700/50 rounded-full">
                  VST3 / CLAP / WASM x64
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Integrate desktop PC plugins with real-time zero-latency DSP bridging
              </p>
            </div>
          </div>

          <button
            id="close-pc-plugins-modal-btn"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-5 bg-neutral-950/40 border-b border-neutral-800/80 gap-2 text-xs font-semibold">
          <button
            id="tab-active-pc-plugins"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Active Plugins ({plugins.length})
          </button>

          <button
            id="tab-add-pc-plugin"
            onClick={() => setActiveTab('add')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors ${
              activeTab === 'add'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Add / Import PC Plugin
          </button>

          <button
            id="tab-pc-bridge-diagnostics"
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-2 py-3 px-3.5 border-b-2 transition-colors ${
              activeTab === 'architecture'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Bridge Architecture & Diagnostics
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'active' && (
            <div className="grid grid-cols-1 md:grid-cols-12 h-full overflow-hidden">
              {/* Left Column: Installed Plugins List */}
              <div className="md:col-span-4 border-r border-neutral-800 flex flex-col h-full bg-neutral-950/30 overflow-y-auto p-3 space-y-2">
                <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  <span>Loaded PC Plugins</span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {plugins.filter((p) => p.enabled).length} ON / {plugins.length} TOTAL
                  </span>
                </div>

                {plugins.map((p) => {
                  const isSelected = p.id === selectedPlugin.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPluginId(p.id)}
                      className={`p-3 rounded-xl cursor-pointer border transition-all text-left flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-cyan-950/30 border-cyan-500/50 shadow-sm'
                          : 'bg-neutral-900/70 border-neutral-800/80 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-neutral-100 truncate">
                          {p.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-mono uppercase font-bold rounded ${
                            p.format === 'vst3'
                              ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                              : p.format === 'clap'
                              ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                              : p.format === 'dll'
                              ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                              : 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                          }`}
                        >
                          {p.format || 'VST3'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span className="truncate">{p.vendor}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              p.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
                            }`}
                          />
                          <span className="text-[11px] font-mono">
                            {p.assignedTrackId === 'master'
                              ? 'Master Bus'
                              : project.tracks.find((t) => t.id === p.assignedTrackId)?.name ||
                                'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  id="add-new-plugin-shortcut-btn"
                  onClick={() => setActiveTab('add')}
                  className="mt-2 py-2.5 px-3 rounded-xl border border-dashed border-neutral-700 hover:border-cyan-500/60 text-neutral-400 hover:text-cyan-400 flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add Another PC Plugin...
                </button>
              </div>

              {/* Right Column: Active Plugin GUI & Control Rack */}
              <div className="md:col-span-8 flex flex-col h-full overflow-y-auto p-5 bg-neutral-900/50">
                {selectedPlugin ? (
                  <div className="flex flex-col h-full space-y-5">
                    {/* Top Plugin Header with Bypass and Route Selector */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-neutral-950/80 rounded-xl border border-neutral-800">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-neutral-100">
                            {selectedPlugin.name}
                          </h3>
                          <span className="px-2 py-0.5 text-[10px] font-mono bg-neutral-800 text-neutral-300 rounded border border-neutral-700">
                            v{selectedPlugin.version}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {selectedPlugin.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Power / Bypass */}
                        <button
                          id={`toggle-power-${selectedPlugin.id}`}
                          onClick={() => handleToggleBypass(selectedPlugin.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition-all ${
                            selectedPlugin.enabled
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/50 shadow-sm shadow-emerald-950'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {selectedPlugin.enabled ? 'ACTIVE' : 'BYPASSED'}
                        </button>

                        {/* Track Assignment */}
                        <div className="flex items-center gap-1.5 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-700/80 text-xs">
                          <Layers className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="text-neutral-400">Route:</span>
                          <select
                            id="plugin-route-selector"
                            value={selectedPlugin.assignedTrackId || 'master'}
                            onChange={(e) => handleAssignTrack(selectedPlugin.id, e.target.value)}
                            className="bg-transparent text-cyan-400 font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value="master" className="bg-neutral-900 text-neutral-100">
                              Master Bus
                            </option>
                            {project.tracks.map((t) => (
                              <option
                                key={t.id}
                                value={t.id}
                                className="bg-neutral-900 text-neutral-100"
                              >
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Presets and Diagnostics Pill Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-neutral-950/40 rounded-lg border border-neutral-800/80 text-xs">
                      {/* Presets Selector */}
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-neutral-400 font-medium">Presets:</span>
                        {selectedPlugin.presets && selectedPlugin.presets.length > 0 ? (
                          <select
                            id="plugin-preset-selector"
                            onChange={(e) => handleApplyPreset(selectedPlugin.id, e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2 py-1 text-xs focus:outline-none"
                          >
                            <option value="">Select factory preset...</option>
                            {selectedPlugin.presets.map((pr) => (
                              <option key={pr.name} value={pr.name}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-neutral-500 italic">No factory presets</span>
                        )}
                      </div>

                      {/* Hardware Latency & CPU */}
                      <div className="flex items-center gap-4 text-xs font-mono text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            Latency: {selectedPlugin.latencySamples ?? 64} smp (
                            {(((selectedPlugin.latencySamples ?? 64) / 48000) * 1000).toFixed(1)}ms)
                          </span>
                        </div>
                        <div>
                          <span>CPU: {selectedPlugin.cpuUsagePct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Knobs & Sliders Rack */}
                    <div className="flex-1 bg-neutral-950/60 p-5 rounded-2xl border border-neutral-800 flex flex-col justify-center">
                      <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center justify-between">
                        <span>DSP Parameter Controls</span>
                        <span className="text-[11px] font-mono text-cyan-500 font-normal">
                          {selectedPlugin.dspAlgorithm || 'Double Precision 64-bit Audio'}
                        </span>
                      </div>

                      {selectedPlugin.parameters && selectedPlugin.parameters.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {selectedPlugin.parameters.map((param) => {
                            return (
                              <div
                                key={param.id}
                                className="p-3.5 bg-neutral-900/90 rounded-xl border border-neutral-800 flex flex-col gap-2 shadow-inner"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-neutral-200 truncate">
                                    {param.name}
                                  </span>
                                  <span className="font-mono text-cyan-400 text-[11px] font-bold">
                                    {param.value} {param.unit}
                                  </span>
                                </div>

                                <input
                                  type="range"
                                  min={param.min}
                                  max={param.max}
                                  step={param.step || (param.max - param.min) / 100}
                                  value={param.value}
                                  onChange={(e) =>
                                    handleParamChange(
                                      selectedPlugin.id,
                                      param.id,
                                      parseFloat(e.target.value)
                                    )
                                  }
                                  className="w-full accent-cyan-500 bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                                />

                                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                                  <span>
                                    {param.min} {param.unit}
                                  </span>
                                  <span>
                                    {param.max} {param.unit}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-12 text-center text-neutral-400">
                          This plugin exposes fixed hardware modeling parameters.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    No plugin selected.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="p-6 overflow-y-auto h-full space-y-8 max-w-4xl mx-auto">
              {/* Option 1: File Upload (.vst3, .clap, .dll, .json) */}
              <div className="bg-neutral-950/70 p-5 rounded-2xl border border-neutral-800 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
                  <UploadCloud className="w-5 h-5 text-cyan-400" />
                  <span>Option A: Import PC Plugin File (.vst3 / .clap / .dll / .wasm)</span>
                </div>
                <p className="text-xs text-neutral-400">
                  Upload a 64-bit desktop PC plugin binary or manifest to sandbox it within the
                  DAW’s WebAssembly SIMD execution container.
                </p>

                <div className="border-2 border-dashed border-neutral-700 hover:border-cyan-500/70 rounded-xl p-6 text-center transition-colors bg-neutral-900/50">
                  <input
                    type="file"
                    id="pc-plugin-file-input"
                    accept=".vst3,.clap,.dll,.wasm,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="pc-plugin-file-input"
                    className="cursor-pointer flex flex-col items-center justify-center gap-2"
                  >
                    <div className="p-3 bg-neutral-800 rounded-full text-cyan-400">
                      <Download className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-200">
                      Click to browse or drop PC plugin file here
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      Supported formats: .vst3, .clap, 64-bit .dll, .wasm, plugin_manifest.json
                    </span>
                  </label>
                </div>

                {importStatus && (
                  <div className="p-3 bg-cyan-950/60 border border-cyan-600/40 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 text-cyan-400" />
                    <span>{importStatus}</span>
                  </div>
                )}
              </div>

              {/* Option 2: Custom PC Plugin Architect */}
              <div className="bg-neutral-950/70 p-5 rounded-2xl border border-neutral-800 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
                  <Sliders className="w-5 h-5 text-purple-400" />
                  <span>Option B: Custom PC Plugin Architect</span>
                </div>
                <p className="text-xs text-neutral-400">
                  Define custom PC plugin metadata, DSP algorithm, and parameters to instantly
                  instantiate a new audio effect.
                </p>

                <form onSubmit={handleCreateCustomPlugin} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Plugin Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Master Tape Saturator x64"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Developer / Vendor
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. SoundWave Audio DSP"
                        value={customVendor}
                        onChange={(e) => setCustomVendor(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        Plugin Format
                      </label>
                      <select
                        value={customFormat}
                        onChange={(e) => setCustomFormat(e.target.value as PCPluginFormat)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="vst3">Steinberg VST3 (x64)</option>
                        <option value="clap">CLAP (Universal Binary)</option>
                        <option value="wasm_pc">Universal WASM PC</option>
                        <option value="dll">Windows 64-bit DLL Bridge</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-300 mb-1">
                        DSP Core Engine
                      </label>
                      <select
                        value={customEngine}
                        onChange={(e) => setCustomEngine(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="Analog Preamp Triode Clipping">
                          Analog Preamp Triode Clipping
                        </option>
                        <option value="Linear Phase Dynamic EQ">Linear Phase Dynamic EQ</option>
                        <option value="Feedback Delay Diffusion Network">
                          Feedback Delay Diffusion Network (Reverb)
                        </option>
                        <option value="IRC-4 Lookahead Mastering Limiter">
                          IRC-4 Lookahead Mastering Limiter
                        </option>
                        <option value="Dual 256-frame Wavetable Interpolator">
                          Dual 256-frame Wavetable Interpolator
                        </option>
                        <option value="Stereo Haas Spatial Imager">
                          Stereo Haas Spatial Imager
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-2"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Instantiate Plugin in DAW
                    </button>
                  </div>
                </form>
              </div>

              {/* Option 3: PC Plugin Cloud & Registry (1-Click Install) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-100">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Option C: Bundled PC Plugin Registry (1-Click Install)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AVAILABLE_PC_PLUGIN_REGISTRY.map((reg) => {
                    const isAlreadyInstalled = plugins.some((p) => p.id === reg.id);
                    return (
                      <div
                        key={reg.id}
                        className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-neutral-100">{reg.name}</span>
                            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                              {reg.format?.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400 mt-1">{reg.description}</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                          <span className="text-[11px] font-mono text-neutral-500">{reg.vendor}</span>
                          <button
                            id={`install-registry-${reg.id}`}
                            onClick={() => handleInstallFromRegistry(reg)}
                            disabled={isAlreadyInstalled}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                              isAlreadyInstalled
                                ? 'bg-neutral-800 text-neutral-500 cursor-default'
                                : 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                            }`}
                          >
                            {isAlreadyInstalled ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                Installed
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                Install
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="p-6 overflow-y-auto h-full space-y-6 max-w-4xl mx-auto">
              <div className="bg-neutral-950/80 p-5 rounded-2xl border border-neutral-800 space-y-3">
                <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  Desktop PC Plugin Sandboxing & WebAssembly SIMD Bridge
                </h3>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  To execute x86_64 VST3, CLAP, and Windows DLL plugins smoothly across both mobile
                  Android hardware and modern desktop browsers without crashing the main audio thread,
                  AURA DAW utilizes a multi-layered sandboxing and zero-copy IPC audio bridge.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2">
                  <div className="font-bold text-sm text-cyan-400">1. WASM SIMD Kernel</div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Plugin DSP routines (filters, convolutions, waveshapers) compile directly into
                    128-bit SIMD vector instructions, delivering native desktop C++ DSP throughput.
                  </p>
                </div>

                <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2">
                  <div className="font-bold text-sm text-cyan-400">2. Zero-Copy Audio Ring Buffer</div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Audio blocks are passed through SharedArrayBuffer lock-free queues with zero
                    allocation, avoiding audio dropouts or garbage-collection spikes.
                  </p>
                </div>

                <div className="p-4 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-2">
                  <div className="font-bold text-sm text-cyan-400">3. Android NDK / JNI Bridge</div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    On physical Android devices, plugins seamlessly bind to native C++ Oboe / AAudio
                    streams with hardware-accelerated NEON SIMD.
                  </p>
                </div>
              </div>

              <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 font-mono text-[11px] text-neutral-300 space-y-1">
                <div className="text-cyan-400 font-bold mb-2"># Active Plugin Bridge Status</div>
                <div>Runtime Mode: WebAudio V2 Worklet + WASM SIMD</div>
                <div>Internal Bit-Depth: 64-bit IEEE Floating Point</div>
                <div>Hardware Sample Rate: 48,000 Hz</div>
                <div>Bridge Latency: 1.33 ms (64 samples buffer)</div>
                <div>Total PC Plugins Loaded: {plugins.length}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
