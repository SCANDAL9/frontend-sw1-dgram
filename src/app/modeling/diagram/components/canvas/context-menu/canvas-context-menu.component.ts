import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CanvasContextMenuState {
  x: number;
  y: number;
  entityId?: string;
}

@Component({
  selector: 'app-canvas-context-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-context-menu.component.html',
})
export class CanvasContextMenuComponent {
  @Input() menu: CanvasContextMenuState | null = null;
  @Input() entityName: string | null = null;

  @Output() inspectEntity = new EventEmitter<string>();
  @Output() duplicateEntity = new EventEmitter<void>();
  @Output() detachEntity = new EventEmitter<string>();
  @Output() deleteEntityFromModel = new EventEmitter<string>();
  @Output() openCommandPalette = new EventEmitter<void>();
  @Output() autoLayout = new EventEmitter<void>();
  @Output() fitToScreen = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}
