import { Component, EventEmitter, Input, Output } from '@angular/core';
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
})
export class QuickLinkerComponent {
  @Input() position: QuickLinkerPosition | null = null;
  @Output() createLinked = new EventEmitter<{ relType: string; classifierType: ClassifierType }>();
  @Output() closed = new EventEmitter<void>();
}
