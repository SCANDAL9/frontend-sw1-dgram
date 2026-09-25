import { Pipe, PipeTransform } from '@angular/core';
import { DBRelation } from '../models/diagram.model';
import { getRelationCategory } from './relation-symbol.pipe';

@Pipe({
  name: 'relationCardinality',
  standalone: true,
  pure: true,
})
export class RelationCardinalityPipe implements PipeTransform {
  transform(rel: DBRelation | null | undefined, end: 'source' | 'target'): string {
    if (!rel) return '';
    if (end === 'source' && rel.sourceMultiplicity) return rel.sourceMultiplicity;
    if (end === 'target' && rel.targetMultiplicity) return rel.targetMultiplicity;

    const parts = (rel.type || '').split(':').map((s) => s.trim());
    if (parts.length === 3) {
      return end === 'source' ? parts[1] : parts[2];
    }
    if (parts.length === 2) {
      const label = end === 'source' ? parts[0] : parts[1];
      return this.expandCardinality(label);
    }

    const cat = getRelationCategory(rel.type);
    if (cat === 'Association') {
      return '1';
    }
    return '';
  }

  private expandCardinality(v: string | undefined): string {
    switch ((v || '').toUpperCase()) {
      case '1':
        return '1';
      case 'N':
      case 'M':
      case '*':
        return '1..*';
      case '0':
        return '0..1';
      case '0N':
      case '0M':
      case '0*':
        return '0..*';
      default:
        return v || '';
    }
  }
}

@Pipe({
  name: 'multiplicityMeaning',
  standalone: true,
  pure: true,
})
export class MultiplicityMeaningPipe implements PipeTransform {
  transform(val: string | null | undefined): string {
    if (!val) return '';
    const v = val.trim();
    switch (v) {
      case '1':
        return 'Exactamente 1';
      case '0..1':
        return '0 o 1 (Opcional)';
      case '1..*':
        return '1 a muchos (Al menos uno)';
      case '*':
      case '0..*':
        return '0 a muchos (Colección)';
      case 'n':
      case 'm':
      case 'N':
      case 'M':
        return 'Muchos';
      default:
        return `Multiplicidad: ${v}`;
    }
  }
}

/** Returns true if the multiplicity represents a "many" cardinality (*, 0..*, 1..*, n, m, etc.) */
export function isManyMultiplicity(val?: string | null): boolean {
  if (!val) return false;
  const s = val.trim().toLowerCase();
  return (
    s === '*' ||
    s.includes('*') ||
    s === 'n' ||
    s === 'm' ||
    s.endsWith('n') ||
    s.endsWith('m') ||
    s === 'many'
  );
}

/** Returns true if both source and target multiplicities represent "many" (N:M relation) */
export function isManyToMany(src?: string | null, tgt?: string | null): boolean {
  return isManyMultiplicity(src) && isManyMultiplicity(tgt);
}
