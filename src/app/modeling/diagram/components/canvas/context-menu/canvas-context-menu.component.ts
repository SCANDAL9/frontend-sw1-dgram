import { Component, input, output } from '@angular/core';
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
  menu = input<CanvasContextMenuState | null>(null);
  entityName = input<string | null>(null);

  inspectEntity = output<string>();
  duplicateEntity = output<void>();
  detachEntity = output<string>();
  deleteEntityFromModel = output<string>();
  openCommandPalette = output<void>();
  autoLayout = output<void>();
  fitToScreen = output<void>();
  closed = output<void>();
}
