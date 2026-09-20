import { Pipe, PipeTransform } from '@angular/core';
import { DBRelation } from '../models/diagram.model';

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
