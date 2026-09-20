import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { XmiPreviewResponse } from '../../models/xmi-preview.model';

@Component({
  selector: 'app-xmi-import-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './xmi-import-preview-modal.component.html',
})
export class XmiImportPreviewModalComponent {
  previewData = input.required<XmiPreviewResponse>();
  fileName = input<string>('');
  isImporting = input<boolean>(false);

  confirm = output<void>();
  cancel = output<void>();

  readonly activeTab = signal<'classes' | 'associations'>('classes');

  close(): void {
    if (!this.isImporting()) {
      this.cancel.emit();
    }
  }

  onConfirm(): void {
    if (!this.isImporting()) {
      this.confirm.emit();
    }
  }

  setActiveTab(tab: 'classes' | 'associations'): void {
    this.activeTab.set(tab);
  }
}
