import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type UmlRelationCategory =
  | 'Generalization'
  | 'Realization'
  | 'Composition'
  | 'Aggregation'
  | 'Dependency'
  | 'Association';

export type MarkerEnd = 'START' | 'END';

@Component({
  selector: 'app-uml-marker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (shape()) {
      @case ('triangle-hollow') {
        <!-- Generalization / Realization: closed hollow triangle pointing right -->
        <svg [attr.width]="14" [attr.height]="14" viewBox="0 0 14 14" overflow="visible" style="overflow:visible">
          <polygon
            points="0,0 13,7 0,14"
            class="uml-marker-triangle"
          />
        </svg>
      }
      @case ('diamond-filled') {
        <!-- Composition: solid diamond -->
        <svg [attr.width]="14" [attr.height]="14" viewBox="0 0 18 10" overflow="visible" style="overflow:visible">
          <polygon
            points="0,5 9,0 18,5 9,10"
            class="uml-marker-diamond-filled"
          />
        </svg>
      }
      @case ('diamond-hollow') {
        <!-- Aggregation: hollow diamond -->
        <svg [attr.width]="14" [attr.height]="10" viewBox="0 0 18 10" overflow="visible" style="overflow:visible">
          <polygon
            points="0,5 9,0 18,5 9,10"
            class="uml-marker-diamond-hollow"
          />
        </svg>
      }
      @case ('open-arrow') {
        <!-- Dependency / Association directed: open chevron -->
        <svg [attr.width]="12" [attr.height]="12" viewBox="0 0 12 12" overflow="visible" style="overflow:visible">
          <polyline
            points="0,0 10,6 0,12"
            class="uml-marker-open-arrow"
          />
        </svg>
      }
      @default {
        <!-- No marker (bidirectional Association) -->
      }
    }
  `,
  host: {
    class: 'uml-marker-host',
    style: 'display:inline-flex;align-items:center;justify-content:center;pointer-events:none;',
  },
})
export class UmlMarkerComponent {
  /** UML relation category string (from `relationCategory` pipe) */
  relType = input<UmlRelationCategory | string>('Association');

  /** Which end of the connector this marker is placed at */
  end = input<MarkerEnd>('END');

  readonly shape = computed(() => {
    const cat = this.relType() as UmlRelationCategory;
    const end = this.end();

    switch (cat) {
      case 'Generalization':
      case 'Realization':
        return end === 'END' ? 'triangle-hollow' : 'none';

      case 'Composition':
        return end === 'END' ? 'diamond-filled' : 'none';

      case 'Aggregation':
        return end === 'END' ? 'diamond-hollow' : 'none';

      case 'Dependency':
        return end === 'END' ? 'open-arrow' : 'none';

      case 'Association':
      default:
        return end === 'END' ? 'open-arrow' : 'none';
    }
  });
}
