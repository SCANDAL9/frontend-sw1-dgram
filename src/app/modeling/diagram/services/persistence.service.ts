import { Injectable, inject } from '@angular/core';
import { DiagramService } from './diagram.service';
import { CommandService } from './command.service';

interface PersistedBoard {
  state: {
    entities: unknown[];
    relations: unknown[];
    version: number;
  };
  history: unknown[];
}

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private diagram = inject(DiagramService);
  private cmd = inject(CommandService);

  private boardId = '';
  private readonly key = (boardId: string) => `dgram:${boardId}`;
  private readonly onBeforeUnload = () => this.saveNow();

  load(boardId: string): void {
    this.boardId = boardId;
    try {
      const raw = localStorage.getItem(this.key(boardId));
      if (!raw) {
        this.diagram.clearState();
        this.cmd.clearHistory();
        return;
      }
      const data = JSON.parse(raw) as PersistedBoard;
      this.diagram.loadState(data.state as any);
      this.cmd.restoreHistory(data.history as any[]);
    } catch (err) {
      console.warn('Failed to load persisted board', err);
      this.diagram.clearState();
      this.cmd.clearHistory();
    }
  }

  activateSave(boardId: string): void {
    this.deactivateSave();
    this.boardId = boardId;
    this.cmd.setPersistHandler(() => this.saveNow());
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  deactivateSave(): void {
    if (this.boardId) {
      this.saveNow();
    }
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.cmd.setPersistHandler(() => {});
    this.boardId = '';
  }

  saveNow(): void {
    if (!this.boardId) return;
    const data: PersistedBoard = {
      state: this.diagram.getState(),
      history: this.cmd.exportHistoryEntries(),
    };

    try {
      localStorage.setItem(this.key(this.boardId), JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to persist board', err);
    }
  }

  clear(boardId: string): void {
    try {
      localStorage.removeItem(this.key(boardId));
    } catch {
      /* ignore */
    }
  }
}