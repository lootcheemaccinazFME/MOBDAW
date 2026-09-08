import { Project } from '../types/daw';

export interface HistoryItem {
  id: string;
  description: string;
  timestamp: number;
  project: Project;
}

export class CommandHistory {
  private past: HistoryItem[] = [];
  private current: HistoryItem;
  private future: HistoryItem[] = [];
  private maxDepth: number = 50;
  private lastActionTime: number = 0;
  private lastDescription: string = '';

  constructor(initialProject: Project, initialDescription: string = 'Initial Project State') {
    this.current = {
      id: 'init_' + Date.now(),
      description: initialDescription,
      timestamp: Date.now(),
      project: JSON.parse(JSON.stringify(initialProject)),
    };
  }

  public getCurrentProject(): Project {
    return this.current.project;
  }

  public push(
    newProject: Project,
    description: string = 'Project Edit',
    debounceTimeMs: number = 250
  ): void {
    const now = Date.now();
    const cloned = JSON.parse(JSON.stringify(newProject));

    // Debounce rapid successive edits of the exact same action (e.g. continuous slider dragging)
    if (
      this.lastDescription === description &&
      now - this.lastActionTime < debounceTimeMs
    ) {
      this.current = {
        id: this.current.id,
        description,
        timestamp: now,
        project: cloned,
      };
      this.lastActionTime = now;
      return;
    }

    this.lastActionTime = now;
    this.lastDescription = description;

    // Push previous current onto past stack
    this.past.push(this.current);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }

    // New state becomes current
    this.current = {
      id: 'cmd_' + now + '_' + Math.floor(Math.random() * 1000),
      description,
      timestamp: now,
      project: cloned,
    };

    // Any new action clears the redo future stack
    this.future = [];
  }

  public canUndo(): boolean {
    return this.past.length > 0;
  }

  public canRedo(): boolean {
    return this.future.length > 0;
  }

  public undo(): HistoryItem | null {
    if (!this.canUndo()) return null;

    const previous = this.past.pop()!;
    this.future.unshift(this.current);
    this.current = previous;

    return this.current;
  }

  public redo(): HistoryItem | null {
    if (!this.canRedo()) return null;

    const next = this.future.shift()!;
    this.past.push(this.current);
    this.current = next;

    return this.current;
  }

  public getUndoDescription(): string | null {
    if (this.past.length === 0) return null;
    return this.current.description;
  }

  public getRedoDescription(): string | null {
    if (this.future.length === 0) return null;
    return this.future[0].description;
  }

  public getHistoryList(): {
    id: string;
    description: string;
    timestamp: number;
    status: 'past' | 'current' | 'future';
    index: number;
  }[] {
    const list: {
      id: string;
      description: string;
      timestamp: number;
      status: 'past' | 'current' | 'future';
      index: number;
    }[] = [];

    let idx = 0;
    this.past.forEach((item) => {
      list.push({
        id: item.id,
        description: item.description,
        timestamp: item.timestamp,
        status: 'past',
        index: idx++,
      });
    });

    list.push({
      id: this.current.id,
      description: this.current.description,
      timestamp: this.current.timestamp,
      status: 'current',
      index: idx++,
    });

    this.future.forEach((item) => {
      list.push({
        id: item.id,
        description: item.description,
        timestamp: item.timestamp,
        status: 'future',
        index: idx++,
      });
    });

    return list;
  }

  public jumpTo(targetIndex: number): Project | null {
    const allItems = [...this.past, this.current, ...this.future];
    if (targetIndex < 0 || targetIndex >= allItems.length) return null;

    const currentIndex = this.past.length;
    if (targetIndex === currentIndex) return this.current.project;

    if (targetIndex < currentIndex) {
      // Undo multiple times
      const steps = currentIndex - targetIndex;
      for (let i = 0; i < steps; i++) {
        this.undo();
      }
    } else {
      // Redo multiple times
      const steps = targetIndex - currentIndex;
      for (let i = 0; i < steps; i++) {
        this.redo();
      }
    }

    return this.current.project;
  }

  public clear(): void {
    this.past = [];
    this.future = [];
  }
}
