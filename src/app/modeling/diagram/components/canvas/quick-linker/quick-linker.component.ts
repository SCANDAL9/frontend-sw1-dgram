import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassifierType } from '../../../models/diagram.model';

export interface QuickLinkerPosition {
  x: number;
  y: number;
  sourceId: string;
}

@Component({
  selector: 'app-quick-linker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quick-linker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickLinkerComponent {
  position = input<QuickLinkerPosition | null>(null);
  createLinked = output<{ relType: string; classifierType: ClassifierType }>();
  closed = output<void>();
}
