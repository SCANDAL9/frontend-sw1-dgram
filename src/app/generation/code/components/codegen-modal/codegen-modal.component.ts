import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardService } from '../../../../modeling/diagram/services/board.service';

@Component({
  selector: 'app-codegen-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './codegen-modal.component.html',
})
export class CodegenModalComponent implements OnInit {
  private boardService = inject(BoardService);

  @Input({ required: true }) boardId!: string;
  @Output() closed = new EventEmitter<void>();

  basePackage = 'com.dgram.generated';
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  files = signal<Record<string, string>>({});
  selectedFile = signal<string | null>(null);
  copied = signal(false);

  fileList = signal<string[]>([]);

  ngOnInit() {
    this.generate();
  }

  close() {
    this.closed.emit();
  }

  downloadUrl(): string {
    return this.boardService.downloadCodeZipUrl(this.boardId, this.basePackage);
  }

  generate() {
    this.loading.set(true);
    this.errorMsg.set(null);

    this.boardService.generateCode(this.boardId, this.basePackage).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.files.set(res.files || {});
        const keys = Object.keys(res.files || {});
        this.fileList.set(keys);
        if (keys.length > 0) {
          this.selectedFile.set(keys[0]);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail || 'Error al generar código Spring Boot');
      },
    });
  }

  currentCode(): string {
    const sel = this.selectedFile();
    return sel ? this.files()[sel] || '' : '';
  }

  copyCode() {
    const code = this.currentCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  getFileBaseName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  getFileIcon(path: string): string {
    if (path.endsWith('.java')) return 'JAVA';
    if (path.endsWith('.xml')) return 'XML';
    if (path.endsWith('.properties') || path.endsWith('.yml')) return 'CONF';
    return 'FILE';
  }
}
