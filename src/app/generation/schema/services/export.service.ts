import { Injectable, inject } from '@angular/core';
import { toPng } from 'html-to-image';
import { DiagramService } from '../../../modeling/diagram/services/diagram.service';
import { DBEntity, DBRelation } from '../../../modeling/diagram/models/diagram.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private diagram = inject(DiagramService);

  toSql(): string {
    const lines: string[] = [];
    for (const e of this.diagram.entities()) {
      lines.push(this.entitySql(e));
    }
    for (const r of this.diagram.relations()) {
      const fk = this.foreignKeySql(r);
      if (fk) lines.push(fk);
    }
    return lines.join('\n\n') + '\n';
  }

  toJson(): string {
    return JSON.stringify(this.diagram.getState(), null, 2);
  }

  async toPng(element: HTMLElement, filename: string): Promise<void> {
    try {
      const dataUrl = await toPng(element, {
        backgroundColor: '#1e1e2e',
        pixelRatio: 2,
        cacheBust: true,
      });
      this.download(filename, dataUrl);
    } catch (err) {
      console.error('PNG export failed', err);
      throw err;
    }
  }

  downloadSql(): void {
    this.download('schema.sql', new Blob([this.toSql()], { type: 'text/sql' }));
  }

  downloadJson(): void {
    this.download('diagram.json', new Blob([this.toJson()], { type: 'application/json' }));
  }

  downloadXmi(boardId: string, filename: string = 'diagram.xmi'): void {
    window.open(`${environment.apiUrl}/boards/${boardId}/export/xmi`, '_blank');
  }

  private entitySql(e: DBEntity): string {
    const cols = e.attributes.map((a) => {
      const parts = [`  ${a.name} ${a.type}`];
      if (a.pk) parts.push('PRIMARY KEY');
      if (!a.nullable && !a.pk) parts.push('NOT NULL');
      return parts.join(' ');
    });
    return `CREATE TABLE ${e.name} (\n${cols.join(',\n')}\n);`;
  }

  private foreignKeySql(r: DBRelation): string {
    const src = this.diagram.getEntity(r.sourceId);
    const tgt = this.diagram.getEntity(r.targetId);
    if (!src || !tgt || !r.sourceColumn || !r.targetColumn) return '';
    return `ALTER TABLE ${tgt.name}\n  ADD CONSTRAINT fk_${tgt.name}_${r.targetColumn}\n  FOREIGN KEY (${r.targetColumn}) REFERENCES ${src.name} (${r.sourceColumn});`;
  }

  private download(filename: string, data: Blob | string): void {
    const url = URL.createObjectURL(
      typeof data === 'string' ? new Blob([data]) : data,
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}