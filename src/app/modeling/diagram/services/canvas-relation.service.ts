import { Injectable, inject, signal, computed } from '@angular/core';
import { DiagramService } from './diagram.service';
import { CommandService } from './command.service';
import { ToastService } from '../../../core/services/toast.service';
import { DBRelation } from '../models/diagram.model';
import { getRelationCategory } from '../pipes/relation-symbol.pipe';

@Injectable({
  providedIn: 'root',
})
export class CanvasRelationService {
  private diagram = inject(DiagramService);
  private cmd = inject(CommandService);
  private toast = inject(ToastService);

  activeMultiplicityRelId = signal<string | null>(null);
  selectedRelationId = signal<string | null>(null);
  hoveredRelationId = signal<string | null>(null);

  readonly selectedRelation = computed(() => {
    const id = this.selectedRelationId();
    return id ? this.diagram.relations().find((r) => r.id === id) ?? null : null;
  });

  readonly activeMultiplicityRel = computed(() => {
    const id = this.activeMultiplicityRelId();
    return id ? this.diagram.relations().find((r) => r.id === id) ?? null : null;
  });

  readonly umlRelationOrder = [
    '1:N',
    '1:1',
    'N:M',
    'Generalization',
    'Composition',
    'Aggregation',
    'Dependency',
    'Realization',
  ];

  cycleRelationType(): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    const cat = getRelationCategory(rel.type);
    let idx = this.umlRelationOrder.indexOf(rel.type);
    if (idx === -1) {
      idx = this.umlRelationOrder.indexOf(cat);
    }
    const next = this.umlRelationOrder[(idx + 1) % this.umlRelationOrder.length];
    this.cmd.updateRelation(rel.id, { type: next });
    this.toast.info(`Relación: ${next}`);
  }

  openMultiplicityConfig(relId: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    if (rel) {
      const cat = getRelationCategory(rel.type);
      if (cat !== 'Association') return;
    }
    this.activeMultiplicityRelId.set(relId);
    this.selectedRelationId.set(relId);
  }

  closeMultiplicityConfig(): void {
    this.activeMultiplicityRelId.set(null);
  }

  setMultiplicities(relId: string, src: string, tgt: string): void {
    const ok = this.cmd.applyMultiplicityChange(relId, src, tgt);
    if (ok) {
      this.toast.info(`Multiplicidad: ${src} ➔ ${tgt}`);
    }
  }

  updateRelSourceMultiplicity(relId: string, src: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    const tgt = rel?.targetMultiplicity || '1';
    this.cmd.applyMultiplicityChange(relId, src, tgt);
  }

  updateRelTargetMultiplicity(relId: string, tgt: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    const src = rel?.sourceMultiplicity || '1';
    this.cmd.applyMultiplicityChange(relId, src, tgt);
  }
}
