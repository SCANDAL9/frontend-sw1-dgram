import { Component, signal, computed, OnInit, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayerFilterType } from '../../models/codegen.model';
import { FileBasenamePipe, FileIconPipe } from '../../pipes/file-basename.pipe';

@Component({
  selector: 'app-codegen-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FileBasenamePipe, FileIconPipe],
  templateUrl: './codegen-modal.component.html',
})
export class CodegenModalComponent implements OnInit {
  boardId = input.required<string>();
  files = input<Record<string, string>>({});
  loading = input<boolean>(false);
  errorMsg = input<string | null>(null);
  downloadUrl = input<string>('');

  generate = output<string>();
  closed = output<void>();

  basePackage = signal<string>('com.dgram.generated');
  selectedFile = signal<string | null>(null);
  copied = signal<boolean>(false);
  layerFilter = signal<LayerFilterType>('ALL');

  readonly fileList = computed<string[]>(() => {
    return Object.keys(this.files() || {});
  });

  readonly currentCode = computed(() => {
    const sel = this.selectedFile();
    return sel ? this.files()[sel] || '' : '';
  });

  readonly filteredFileList = computed(() => {
    const list = this.fileList();
    const filter = this.layerFilter();
    if (filter === 'ALL') return list;
    if (filter === 'ENTITY') return list.filter((f) => f.includes('/entity/'));
    if (filter === 'SERVICE') return list.filter((f) => f.includes('/service/'));
    if (filter === 'CONTROLLER') return list.filter((f) => f.includes('/controller/'));
    if (filter === 'REPOSITORY') return list.filter((f) => f.includes('/repository/'));
    if (filter === 'DTO_MAPPER') return list.filter((f) => f.includes('/dto/') || f.includes('/mapper/'));
    if (filter === 'OTHER') {
      return list.filter(
        (f) =>
          !f.includes('/entity/') &&
          !f.includes('/service/') &&
          !f.includes('/controller/') &&
          !f.includes('/repository/') &&
          !f.includes('/dto/') &&
          !f.includes('/mapper/')
      );
    }
    return list;
  });

  constructor() {
    effect(() => {
      const keys = this.fileList();
      const current = this.selectedFile();
      if (keys.length > 0 && (!current || !keys.includes(current))) {
        this.selectedFile.set(keys[0]);
      }
    });
  }

  ngOnInit(): void {
    if (Object.keys(this.files()).length === 0) {
      this.generateCode();
    }
  }

  close(): void {
    this.closed.emit();
  }

  generateCode(): void {
    this.generate.emit(this.basePackage());
  }

  copyCode(): void {
    const code = this.currentCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
