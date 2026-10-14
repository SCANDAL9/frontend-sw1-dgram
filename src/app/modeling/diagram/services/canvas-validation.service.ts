import { Injectable, inject } from '@angular/core';
import { DiagramService } from './diagram.service';
import { DBEntity, DBRelation } from '../models/diagram.model';
import { getRelationCategory } from '../pipes/relation-symbol.pipe';

@Injectable({
  providedIn: 'root',
})
export class CanvasValidationService {
  private diagram = inject(DiagramService);

  getClassifierType(entity: DBEntity | undefined): string {
    if (!entity) return 'class';
    const st = entity.stereotype?.toLowerCase();
    if (entity.elementType) return entity.elementType.toLowerCase();
    if (st === 'enumeration' || st === 'interface' || st === 'datatype') return st;
    if (entity.isAbstract) return 'abstract_class';
    return 'class';
  }

  validateRelationSemantics(srcId: string, tgtId: string, relType: string): string | null {
    const src = this.diagram.entities().find((e) => e.id === srcId);
    const tgt = this.diagram.entities().find((e) => e.id === tgtId);
    if (!src || !tgt) return null;

    const srcType = this.getClassifierType(src);
    const tgtType = this.getClassifierType(tgt);
    const kind = (relType || 'Association').toLowerCase();
    const cat = getRelationCategory(relType);

    // 0. Bloqueo de auto-herencia y auto-realización reflexiva
    if (
      srcId === tgtId &&
      (kind.startsWith('generalization') ||
        kind.startsWith('inheritance') ||
        kind.startsWith('realization') ||
        kind.startsWith('implementation'))
    ) {
      return 'Un clasificador no puede tener relaciones de herencia o realización hacia sí mismo.';
    }

    // 1. Generalización (Herencia)
    if (kind.startsWith('generalization') || kind.startsWith('inheritance')) {
      if (srcType === 'enumeration' || tgtType === 'enumeration') {
        return 'Los Enumeradores (enum) no pueden participar en relaciones de herencia.';
      }
      if (srcType === 'datatype' || tgtType === 'datatype') {
        return 'Los DataTypes (Value Objects) no soportan herencia.';
      }
      if ((srcType === 'class' || srcType === 'abstract_class') && tgtType === 'interface') {
        return 'Una clase no puede heredar de una interfaz. Utiliza una relación de Realización (implements).';
      }
      if (srcType === 'interface' && (tgtType === 'class' || tgtType === 'abstract_class')) {
        return 'Una interfaz no puede heredar de una clase.';
      }

      // Restricción de Herencia Simple entre Clases (Spring Boot / SQL)
      if (srcType === 'class' || srcType === 'abstract_class') {
        const existingParent = this.diagram.relations().find(
          (r) =>
            r.sourceId === srcId &&
            (r.type.toLowerCase().startsWith('generalization') || r.type.toLowerCase().startsWith('inheritance'))
        );
        if (existingParent && existingParent.targetId !== tgtId) {
          const parentEntity = this.diagram.entities().find((e) => e.id === existingParent.targetId);
          return `Herencia múltiple no soportada: la clase ya hereda de '${parentEntity?.name || 'otra clase'}'. Java y dgram solo admiten herencia simple entre clases. Para múltiples contratos, utiliza Realización hacia Interfaces.`;
        }
      }
      return null;
    }

    // 2. Realización (Implementación de interfaz)
    if (kind.startsWith('realization') || kind.startsWith('implementation')) {
      if (tgtType !== 'interface') {
        return 'La Realización solo puede tener como destino una Interfaz.';
      }
      if (srcType === 'interface') {
        return 'Una interfaz no realiza otra interfaz; debe extenderla mediante Generalización.';
      }
      if (srcType === 'enumeration' || srcType === 'datatype') {
        return 'Los enums y datatypes no pueden realizar interfaces.';
      }
      return null;
    }

    // 3. Asociación / Agregación / Composición
    if (cat === 'Association') {
      if (srcType === 'enumeration' || tgtType === 'enumeration') {
        return 'Los enums no se conectan mediante asociaciones de línea; agrégalos como tipo de dato en los atributos de la clase.';
      }
    }

    return null;
  }

  wouldCreateGeneralizationCycle(childId: string, parentId: string, excludeRelId?: string): boolean {
    if (childId === parentId) return true;

    const visited = new Set<string>();
    const queue = [parentId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === childId) return true;
      visited.add(curr);

      const parentRelations = this.diagram.relations().filter(
        (r) =>
          r.id !== excludeRelId &&
          r.sourceId === curr &&
          (r.type.startsWith('Generalization') || r.type.startsWith('Realization'))
      );

      for (const pr of parentRelations) {
        if (!visited.has(pr.targetId)) {
          queue.push(pr.targetId);
        }
      }
    }

    return false;
  }
}
