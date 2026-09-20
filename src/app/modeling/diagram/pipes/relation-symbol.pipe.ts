import { Pipe, PipeTransform } from '@angular/core';

export function getRelationCategory(type: string | undefined): string {
  if (!type) return 'Association';
  const t = type.toLowerCase().trim();
  if (t === 'generalization' || t === 'inheritance') return 'Generalization';
  if (t === 'aggregation') return 'Aggregation';
  if (t === 'composition') return 'Composition';
  if (t === 'dependency') return 'Dependency';
  if (t === 'realization') return 'Realization';
  return 'Association';
}

@Pipe({
  name: 'relationCategory',
  standalone: true,
  pure: true,
})
export class RelationCategoryPipe implements PipeTransform {
  transform(type: string | undefined): string {
    return getRelationCategory(type);
  }
}

@Pipe({
  name: 'relationSymbol',
  standalone: true,
  pure: true,
})
export class RelationSymbolPipe implements PipeTransform {
  transform(type: string | undefined): string {
    const cat = getRelationCategory(type);
    switch (cat) {
      case 'Generalization':
        return '▷';
      case 'Realization':
        return '⇢▷';
      case 'Aggregation':
        return '◇';
      case 'Composition':
        return '◆';
      case 'Dependency':
        return '⇢';
      default:
        return '→';
    }
  }
}

@Pipe({
  name: 'isDashedRelation',
  standalone: true,
  pure: true,
})
export class IsDashedRelationPipe implements PipeTransform {
  transform(type: string | undefined): boolean {
    const cat = getRelationCategory(type);
    return cat === 'Dependency' || cat === 'Realization';
  }
}
