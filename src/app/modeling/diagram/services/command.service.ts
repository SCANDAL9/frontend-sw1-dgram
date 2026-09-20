import { Injectable, inject, signal } from '@angular/core';
import { DiagramService } from './diagram.service';
import { WebsocketService } from './websocket.service';
import { ColumnData } from '../models/command_payload';
import { Command } from '../models/command';
import { CommandType } from '../models/command_type';
import { invert, StateSnapshot } from '../../../workspace/history/services/command-inverter.service';

/** Entry in the local command history with its pre-execution state snapshot. */
interface HistoryEntry {
  cmd: Command;
  /** Diagram state captured BEFORE this command was applied. */
  snapshot: StateSnapshot;
}

@Injectable({ providedIn: 'root' })
export class CommandService {
  private diagram = inject(DiagramService);
  private ws = inject(WebsocketService);
  private counter = 0;

  /**
   * Per-actor history: only commands produced by THIS user.
   * Remote commands from other actors are NOT added here — they go directly
   * into DiagramService so the local user does not accidentally undo
   * someone else's work.
   */
  private localHistory: HistoryEntry[] = [];
  private localPointer = -1;

  undoState = signal(false);
  redoState = signal(false);

  private onPersist?: () => void;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  setPersistHandler(fn: () => void): void {
    this.onPersist = fn;
  }

  exportHistory(): Command[] {
    return this.localHistory.map((e) => e.cmd);
  }

  exportHistoryEntries(): Array<{ cmd: Command; snapshot: StateSnapshot }> {
    // Keep at most last 50 entries to keep localStorage size bounded and fast
    const slice = this.localHistory.slice(-50);
    return slice.map((e) => ({
      cmd: e.cmd,
      snapshot: e.snapshot,
    }));
  }

  restoreHistory(entries: Array<{ cmd: Command; snapshot?: StateSnapshot } | Command>): void {
    if (!entries || !Array.isArray(entries)) return;
    this.localHistory = entries.map((item) => {
      const isWrapped = item && typeof item === 'object' && 'cmd' in item;
      const cmd = isWrapped ? (item as any).cmd : (item as Command);
      let snapshot = isWrapped ? (item as any).snapshot : null;

      // Fallback: if snapshot was empty or missing, synthesize from current diagram state
      if (!snapshot || !snapshot.entities || snapshot.entities.length === 0) {
        snapshot = this._currentSnapshot();
      }

      return {
        cmd,
        snapshot,
      };
    });
    this.localPointer = this.localHistory.length - 1;
    this._refreshUndoState();
  }



  private _schedulePersist(): void {
    if (!this.onPersist) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.onPersist!();
      this.persistTimer = null;
    }, 300);
  }

  private _nextVersion(): number {
    return this.diagram.version() + 1;
  }

  private _currentSnapshot(): StateSnapshot {
    return this.diagram.getState() as StateSnapshot;
  }

  private _createAndApply(type: CommandType, payload: Record<string, any>): Command {
    const snapshot = this._currentSnapshot();
    const cmd: Command = {
      command_id: `cmd-${Date.now()}-${this.counter++}`,
      command_type: type,
      payload: payload as any,
      actor: `user:${this.ws.userId()}`,
      timestamp: new Date().toISOString(),
      model_version: this._nextVersion(),
    };

    this.diagram.applyCommand(cmd);

    // Truncate redo-branch: after a new action, redo is cleared
    this.localHistory = this.localHistory.slice(0, this.localPointer + 1);
    this.localHistory.push({ cmd, snapshot });
    this.localPointer = this.localHistory.length - 1;

    this.ws.markApplied(cmd.command_id);
    this.ws.send({ type: 'command:send', data: cmd });
    this._refreshUndoState();
    this._schedulePersist();

    return cmd;
  }

  /**
   * Ingest a command from a remote actor.
   * Does NOT enter the local undo stack — applied to the diagram directly.
   */
  ingestRemote(cmd: Command): void {
    this.diagram.applyCommand(cmd);
    this._schedulePersist();
  }

  /**
   * Selective per-actor undo.
   *
   * Computes the inverse of the last LOCAL command and sends it as a normal
   * command:send. The inverse is persisted in board_history with this user's
   * actor_id and broadcast to all peers — no global state:sync, no flicker.
   */
  undo(): void {
    if (this.localPointer < 0) return;

    const entry = this.localHistory[this.localPointer];
    const result = invert(entry.cmd, entry.snapshot);

    if (!result) {
      // Command type not invertible — skip silently
      this.localPointer--;
      this._refreshUndoState();
      return;
    }

    // The inverse itself will push to localHistory via _createAndApply.
    // We need to step back by the original entry BEFORE the inverse is added.
    const pointerBeforeInverse = this.localPointer - 1;

    this._createAndApply(result.type, result.payload as Record<string, any>);

    // Rewind pointer so undoing again goes to the right place
    this.localPointer = Math.max(-1, pointerBeforeInverse);
    this._refreshUndoState();
  }

  /**
   * Selective per-actor redo.
   * Re-applies the next command in the local history by sending it again.
   */
  redo(): void {
    const redoIndex = this.localPointer + 1;
    if (redoIndex >= this.localHistory.length) return;

    const { cmd } = this.localHistory[redoIndex];
    this._createAndApply(cmd.command_type, cmd.payload as Record<string, any>);
    this._refreshUndoState();
  }

  private _refreshUndoState(): void {
    this.undoState.set(this.localPointer >= 0);
    this.redoState.set(this.localPointer < this.localHistory.length - 1);
  }

  // ── Public command factory methods ────────────────────────────────────────

  createEntity(
    id: string,
    name: string,
    columns: ColumnData[] = [],
    position = { x: 100, y: 100 },
    options?: { element_type?: string; elementType?: string; stereotype?: string | null; is_abstract?: boolean },
  ): void {
    this._createAndApply('CREATE_ENTITY', {
      entity_id: id,
      entity_name: name,
      columns,
      position,
      element_type: options?.element_type || options?.elementType,
      elementType: options?.elementType || options?.element_type,
      stereotype: options?.stereotype,
      is_abstract: options?.is_abstract,
    });
    this.ws.sendSelection([id]);
  }

  deleteEntity(id: string): void {
    this._createAndApply('DELETE_ENTITY', { entity_id: id });
    this.ws.sendSelection([]);
  }

  updateEntity(
    id: string,
    name: string,
    options?: { element_type?: string; elementType?: string; stereotype?: string | null; is_abstract?: boolean },
  ): void {
    this._createAndApply('UPDATE_ENTITY', {
      entity_id: id,
      entity_name: name,
      element_type: options?.element_type || options?.elementType,
      elementType: options?.elementType || options?.element_type,
      stereotype: options?.stereotype,
      is_abstract: options?.is_abstract,
      ...(options || {}),
    });
  }

  moveEntity(id: string, position: { x: number; y: number }): void {
    this._createAndApply('MOVE_ENTITY', { entity_id: id, position });
  }

  addColumn(entityId: string, column: ColumnData): void {
    this._createAndApply('ADD_COLUMN', {
      entity_id: entityId,
      column_changes: column,
    });
  }

  updateColumn(entityId: string, columnName: string, changes: Partial<ColumnData>): void {
    this._createAndApply('UPDATE_COLUMN', {
      entity_id: entityId,
      column_name: columnName,
      column_changes: changes,
    });
  }

  deleteColumn(entityId: string, columnName: string): void {
    this._createAndApply('DELETE_COLUMN', {
      entity_id: entityId,
      column_name: columnName,
    });
  }

  resizeEntity(id: string, width: number, height: number): void {
    this._createAndApply('RESIZE_ENTITY', {
      entity_id: id,
      width,
      height,
    });
  }

  assignClassPackage(classId: string, packageId: string): void {
    this._createAndApply('ASSIGN_CLASS_PACKAGE', {
      entity_id: classId,
      package_id: packageId,
    });
  }

  createPackage(name: string, id?: string): void {
    this._createAndApply('CREATE_PACKAGE', {
      package_id: id || `pkg-${Date.now()}-${this.counter++}`,
      package_name: name,
    });
  }

  updatePackage(id: string, name: string): void {
    this._createAndApply('UPDATE_PACKAGE', {
      package_id: id,
      package_name: name,
    });
  }

  deletePackage(id: string): void {
    this._createAndApply('DELETE_PACKAGE', {
      package_id: id,
    });
  }

  createRelation(
    sourceId: string,
    targetId: string,
    sourceColumn: string,
    targetColumn: string,
    type = '1:N',
    name?: string | null,
    sourceRole?: string | null,
    targetRole?: string | null,
    sourceMultiplicity?: string | null,
    targetMultiplicity?: string | null,
  ): void {
    this._createAndApply('CREATE_RELATION', {
      relation_id: `rel-${Date.now()}-${this.counter++}`,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      source_column: sourceColumn,
      target_column: targetColumn,
      relation_type: type,
      name,
      source_role: sourceRole,
      target_role: targetRole,
      source_multiplicity: sourceMultiplicity,
      target_multiplicity: targetMultiplicity,
    });
  }

  updateRelation(
    id: string,
    changes: {
      type?: string;
      sourceColumn?: string;
      targetColumn?: string;
      name?: string | null;
      sourceRole?: string | null;
      targetRole?: string | null;
      sourceMultiplicity?: string | null;
      targetMultiplicity?: string | null;
    }
  ): void {
    this._createAndApply('UPDATE_RELATION', {
      relation_id: id,
      relation_type: changes.type,
      source_column: changes.sourceColumn,
      target_column: changes.targetColumn,
      name: changes.name,
      source_role: changes.sourceRole,
      target_role: changes.targetRole,
      source_multiplicity: changes.sourceMultiplicity,
      target_multiplicity: changes.targetMultiplicity,
    });
  }

  deleteRelation(id: string): void {
    this._createAndApply('DELETE_RELATION', { relation_id: id });
  }

  linkAssociationClass(relationId: string, classId: string): void {
    this._createAndApply('LINK_ASSOCIATION_CLASS', {
      relation_id: relationId,
      class_id: classId,
    });
  }

  unlinkAssociationClass(relationId: string): void {
    this._createAndApply('UNLINK_ASSOCIATION_CLASS', {
      relation_id: relationId,
    });
  }
}
