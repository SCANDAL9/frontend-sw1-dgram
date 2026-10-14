import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ExportService } from '../../../generation/schema/services/export.service';
import { ToastService } from '../../../core/services/toast.service';
import { ExportFormat } from '../components/export-scope-modal/export-scope-modal.component';

@Injectable({
  providedIn: 'root',
})
export class BoardExportCoordinatorService {
  private exportSvc: ExportService = inject(ExportService);
  private toast: ToastService = inject(ToastService);

  async executeExport(
    format: ExportFormat,
    scope: 'selected' | 'all',
    boardId: string,
    selectedIds?: string[],
    flowHost?: HTMLElement | null
  ): Promise<void> {
    const targetIds = scope === 'selected' ? selectedIds : undefined;

    switch (format) {
      case 'sql':
        this.exportSvc.downloadSql(targetIds);
        this.toast.success(
          scope === 'selected'
            ? 'Script SQL (seleccionados) descargado'
            : 'Script SQL descargado'
        );
        break;

      case 'json':
        this.exportSvc.downloadJson(targetIds);
        this.toast.success(
          scope === 'selected'
            ? 'Esquema JSON (seleccionados) descargado'
            : 'Esquema JSON descargado'
        );
        break;

      case 'xmi': {
        if (!boardId || boardId === 'default-board') {
          this.toast.error('Guarda el tablero antes de exportar a XMI');
          return;
        }
        try {
          await firstValueFrom(this.exportSvc.downloadXmi(boardId, 'diagram.xmi', targetIds));
          this.toast.success(
            scope === 'selected'
              ? 'Archivo XMI 2.1 (seleccionados) generado'
              : 'Archivo XMI 2.1 (Enterprise Architect) generado'
          );
        } catch (err) {
          console.error('Error al exportar XMI:', err);
          this.toast.error('Error al exportar a XMI');
        }
        break;
      }

      case 'png': {
        if (!flowHost) return;
        try {
          await this.exportSvc.toPng(flowHost, 'diagram.png', targetIds);
          this.toast.success(
            scope === 'selected'
              ? 'Imagen PNG (seleccionados) guardada'
              : 'Imagen PNG guardada'
          );
        } catch {
          this.toast.error('Error al exportar PNG');
        }
        break;
      }
    }
  }
}
