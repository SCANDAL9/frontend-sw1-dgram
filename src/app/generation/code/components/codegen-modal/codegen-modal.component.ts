import { Component, signal, computed, OnInit, input, output, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { LayerFilterType } from '../../models/codegen.model';
import { FileBasenamePipe, FileIconPipe } from '../../pipes/file-basename.pipe';
import { CodegenService } from '../../services/codegen.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-codegen-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, FileBasenamePipe, FileIconPipe],
  templateUrl: './codegen-modal.component.html',
})
export class CodegenModalComponent implements OnInit {
  private codegenService = inject(CodegenService);
  private toast = inject(ToastService);

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
  isDownloading = signal<boolean>(false);
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

  async downloadZip(): Promise<void> {
    if (this.isDownloading() || this.loading() || this.fileList().length === 0) return;
    this.isDownloading.set(true);
    try {
      const blob = await firstValueFrom(
        this.codegenService.downloadZip(this.boardId(), this.basePackage())
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.basePackage().replace(/\./g, '_')}_code.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.toast.success('Proyecto .ZIP descargado exitosamente');
    } catch (err) {
      console.error('Error al descargar ZIP:', err);
      this.toast.error('Error al descargar el archivo ZIP');
    } finally {
      this.isDownloading.set(false);
    }
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
