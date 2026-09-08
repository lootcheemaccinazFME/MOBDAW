import { useState, useCallback, useRef, useEffect } from 'react';
import { Project } from '../types/daw';
import { CommandHistory } from './CommandHistory';
import { AudioEngine } from '../audio/AudioEngine';

export interface UpdateProjectOptions {
  description?: string;
  skipHistory?: boolean;
  debounceTimeMs?: number;
}

export function useProjectHistory(initialProject: Project) {
  const historyRef = useRef<CommandHistory>(
    new CommandHistory(initialProject, 'Open Project')
  );
  const [project, setProjectState] = useState<Project>(initialProject);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoDescription, setUndoDescription] = useState<string | null>(null);
  const [redoDescription, setRedoDescription] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState(historyRef.current.getHistoryList());

  const syncStateFromHistory = useCallback(() => {
    const hist = historyRef.current;
    const currentProj = hist.getCurrentProject();
    setProjectState(currentProj);
    setCanUndo(hist.canUndo());
    setCanRedo(hist.canRedo());
    setUndoDescription(hist.getUndoDescription());
    setRedoDescription(hist.getRedoDescription());
    setHistoryList(hist.getHistoryList());

    // Sync to AudioEngine
    AudioEngine.getInstance().setProject(currentProj);
  }, []);

  // Main Project Update Dispatcher
  const updateProject = useCallback(
    (
      updaterOrNew: ((prev: Project) => Project) | Project,
      actionDescription: string = 'Edit Project',
      options?: UpdateProjectOptions
    ) => {
      setProjectState((prev) => {
        const nextProject =
          typeof updaterOrNew === 'function' ? updaterOrNew(prev) : updaterOrNew;

        if (!options?.skipHistory) {
          historyRef.current.push(
            nextProject,
            actionDescription,
            options?.debounceTimeMs ?? 200
          );
        }

        const hist = historyRef.current;
        setCanUndo(hist.canUndo());
        setCanRedo(hist.canRedo());
        setUndoDescription(hist.getUndoDescription());
        setRedoDescription(hist.getRedoDescription());
        setHistoryList(hist.getHistoryList());

        AudioEngine.getInstance().setProject(nextProject);
        return nextProject;
      });
    },
    []
  );

  const undo = useCallback(() => {
    const item = historyRef.current.undo();
    if (item) {
      syncStateFromHistory();
    }
  }, [syncStateFromHistory]);

  const redo = useCallback(() => {
    const item = historyRef.current.redo();
    if (item) {
      syncStateFromHistory();
    }
  }, [syncStateFromHistory]);

  const jumpToStep = useCallback(
    (targetIndex: number) => {
      const proj = historyRef.current.jumpTo(targetIndex);
      if (proj) {
        syncStateFromHistory();
      }
    },
    [syncStateFromHistory]
  );

  // Global Undo / Redo Keyboard Shortcuts (Ctrl+Z, Cmd+Z, Ctrl+Y, Ctrl+Shift+Z, Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in standard text inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isMod = isMac ? e.metaKey : e.ctrlKey;

      if (!isMod) return;

      // Undo: Ctrl+Z / Cmd+Z (without shift)
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
      }
      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
      else if ((e.code === 'KeyZ' && e.shiftKey) || e.code === 'KeyY') {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [undo, redo]);

  return {
    project,
    updateProject,
    undo,
    redo,
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    historyList,
    jumpToStep,
  };
}
