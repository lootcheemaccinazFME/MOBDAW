import React, { useState } from 'react';
import {
  Code,
  X,
  FileCode,
  Cpu,
  Layers,
  CheckCircle,
  Copy,
  Terminal,
} from 'lucide-react';
import { ANDROID_PRODUCTION_ARCHITECTURE } from '../native/androidSourceFiles';

interface NativeArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NativeArchitectureModal: React.FC<NativeArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    'cpp' | 'jni' | 'kotlin' | 'pluginSdk'
  >('cpp');
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentCategoryObj = ANDROID_PRODUCTION_ARCHITECTURE[selectedCategory];
  const currentFile = currentCategoryObj.files[selectedFileIdx] || currentCategoryObj.files[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col text-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-neutral-950 border-b border-neutral-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-sm text-white">
                Android NDK / Oboe Real-Time DSP Audio Architecture
              </h3>
              <p className="text-[10px] text-neutral-400">
                Production C++20 engine, AAudio lock-free queues, JNI bridge, and IPC Plugin SDK
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="h-11 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'cpp', label: 'C++ / Oboe DSP Engine' },
                { id: 'jni', label: 'JNI Native Bridge' },
                { id: 'kotlin', label: 'Kotlin Audio Engine Service' },
                { id: 'pluginSdk', label: 'AuraPlugin SDK (AIDL)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setSelectedCategory(tab.id);
                  setSelectedFileIdx(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedCategory === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-semibold transition cursor-pointer"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Source'}</span>
          </button>
        </div>

        {/* Main Body: File Selector Sidebar + Code Viewer */}
        <div className="flex-1 flex overflow-hidden">
          {/* File sidebar */}
          <div className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col p-2 gap-1 overflow-y-auto shrink-0">
            <span className="text-[10px] font-bold text-neutral-500 uppercase px-2 py-1">
              Source Files ({currentCategoryObj.files.length})
            </span>
            {currentCategoryObj.files.map((file, idx) => (
              <button
                key={file.name}
                onClick={() => setSelectedFileIdx(idx)}
                className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs font-mono transition cursor-pointer ${
                  selectedFileIdx === idx
                    ? 'bg-neutral-800 text-cyan-300 font-bold border border-neutral-700'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <FileCode className="w-4 h-4 shrink-0 text-cyan-400" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}

            <div className="mt-auto p-2 bg-neutral-900/60 rounded-lg border border-neutral-800 text-[10px] text-neutral-400">
              <span className="font-bold text-neutral-300 block mb-0.5">Real-Time Safe Rules:</span>
              • Zero malloc/free on audio thread<br />
              • Lock-free SPSC circular queues<br />
              • AAudio Exclusive Mode stream<br />
              • SIMD vectorized DSP processing
            </div>
          </div>

          {/* Code View Area */}
          <div className="flex-1 bg-neutral-950 p-4 overflow-y-auto font-mono text-xs text-neutral-300">
            <div className="text-[11px] text-neutral-500 mb-2 border-b border-neutral-800/80 pb-1">
              // File: {currentFile.path}
            </div>
            <pre className="leading-relaxed whitespace-pre-wrap selection:bg-cyan-900 selection:text-white">
              {currentFile.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
