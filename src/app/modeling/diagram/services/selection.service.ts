import { Injectable, signal, computed } from '@angular/core';

export type ActiveTool = 'select' | 'hand' | 'relation';
export type UMLRelationKind =
  | 'Association'
  | 'Generalization'
  | 'Aggregation'
  | 'Composition'
  | 'Dependency'
  | 'Realization';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly ids = signal<Set<string>>(new Set());
  readonly activeTool = signal<ActiveTool>('select');
  readonly currentRelationKind = signal<UMLRelationKind>('Association');
  readonly pendingSourceId = signal<string | null>(null);

  readonly hasSelection = computed(() => this.ids().size > 0);
  readonly singleId = computed(() => {
    const set = this.ids();
    return set.size === 1 ? [...set][0] : null;
  });

  setTool(tool: ActiveTool): void {
    this.activeTool.set(tool);
    if (tool !== 'relation') {
      this.pendingSourceId.set(null);
    }
  }

  setRelationKind(kind: UMLRelationKind): void {
    this.currentRelationKind.set(kind);
    this.setTool('relation');
  }

  set(ids: Iterable<string>): void {
    this.ids.set(new Set(ids));
  }

  clear(): void {
    this.ids.set(new Set());
    this.pendingSourceId.set(null);
  }
}