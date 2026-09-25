import { Component, input, output, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ExportFormat = 'sql' | 'json' | 'png' | 'xmi' | 'codegen';

@Component({
  selector: 'app-export-scope-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './export-scope-modal.component.html',
})
export class ExportScopeModalComponent {
  isOpen = input<boolean>(false);
  format = input<ExportFormat>('png');
  selectedCount = input<number>(0);
  totalCount = input<number>(0);

  scopeSelected = output<'selected' | 'all'>();
  close = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close.emit();
    }
  }

  getFormatLabel(): string {
    switch (this.format()) {
      case 'sql':
        return 'Script SQL (DDL)';
      case 'json':
        return 'Esquema JSON';
      case 'png':
        return 'Imagen PNG';
      case 'xmi':
        return 'Modelo UML XMI 2.1';
      case 'codegen':
        return 'Generación de Código';
      default:
        return 'Diagrama';
    }
  }
}
