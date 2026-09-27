import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { toPng } from 'html-to-image';
import { DiagramService } from '../../../modeling/diagram/services/diagram.service';
import { DBEntity, DBRelation } from '../../../modeling/diagram/models/diagram.model';
import { environment } from '../../../../environments/environment';

interface InferredForeignKey {
  receivingEntityId: string;
  fkColumnName: string;
  fkColumnType: string;
  referencedEntityName: string;
  referencedPkName: string;
  constraintName: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private http = inject(HttpClient);
  private diagram = inject(DiagramService);

  toSql(selectedIds?: string[]): string {
    const allEntities = this.diagram.entities();
    const entities =
      selectedIds && selectedIds.length > 0
        ? allEntities.filter((e) => selectedIds.includes(e.id))
        : allEntities;

    const entityIds = new Set(entities.map((e) => e.id));
    const allRelations = this.diagram.relations();
    const relations = allRelations.filter(
      (r) => entityIds.has(r.sourceId) && entityIds.has(r.targetId)
    );

    // Analyze relations to infer foreign keys and junction tables according to UML multiplicities
    const inferredFks: InferredForeignKey[] = [];
    const junctionTables: string[] = [];
    const fkColsByEntityId = new Map<string, Array<{ name: string; type: string }>>();

    for (const r of relations) {
      const src = entities.find((e) => e.id === r.sourceId);
      const tgt = entities.find((e) => e.id === r.targetId);
      if (!src || !tgt) continue;

      const srcPk = src.attributes.find((a) => a.pk) || { name: 'id', type: 'UUID' };
      const tgtPk = tgt.attributes.find((a) => a.pk) || { name: 'id', type: 'UUID' };

      const srcMult = (r.sourceMultiplicity || '').trim();
      const tgtMult = (r.targetMultiplicity || '').trim();

      const isM2M =
        r.type === 'ManyToMany' ||
        (srcMult.includes('*') && tgtMult.includes('*'));

      const isSelf = src.id === tgt.id;

      if (isM2M) {
        // Many-to-Many creates a junction table
        const junctionName = isSelf
          ? `${src.name.toLowerCase()}_${(r.sourceRole || 'hierarchy').toLowerCase()}`
          : `${src.name.toLowerCase()}_${tgt.name.toLowerCase()}`;
        
        let srcCol: string;
        let tgtCol: string;
        if (isSelf) {
          srcCol = r.sourceRole
            ? `${r.sourceRole.toLowerCase()}_${srcPk.name}`
            : `parent_${srcPk.name}`;
          tgtCol = r.targetRole
            ? `${r.targetRole.toLowerCase()}_${tgtPk.name}`
            : `child_${tgtPk.name}`;
          if (srcCol === tgtCol) {
            srcCol = `source_${srcPk.name}`;
            tgtCol = `target_${tgtPk.name}`;
          }
        } else {
          srcCol = `${src.name.toLowerCase()}_${srcPk.name}`;
          tgtCol = `${tgt.name.toLowerCase()}_${tgtPk.name}`;
        }

        junctionTables.push(
          `CREATE TABLE ${junctionName} (\n` +
          `  ${srcCol} ${srcPk.type} NOT NULL REFERENCES ${src.name} (${srcPk.name}) ON DELETE CASCADE,\n` +
          `  ${tgtCol} ${tgtPk.type} NOT NULL REFERENCES ${tgt.name} (${tgtPk.name}) ON DELETE CASCADE,\n` +
          `  PRIMARY KEY (${srcCol}, ${tgtCol})\n` +
          `);`
        );
        continue;
      }

      // Check legacy column-based relation if specified
      if (r.sourceColumn && r.targetColumn) {
        inferredFks.push({
          receivingEntityId: tgt.id,
          fkColumnName: r.targetColumn,
          fkColumnType: srcPk.type,
          referencedEntityName: src.name,
          referencedPkName: r.sourceColumn,
          constraintName: `fk_${tgt.name.toLowerCase()}_${r.targetColumn}`,
        });
        continue;
      }

      // Determine receiving entity by multiplicity:
      // If Source has * and Target has 1: Source references Target
      // If Target has * and Source has 1 (or default): Target references Source
      let receiving = tgt;
      let referenced = src;
      let referencedPk = srcPk;
      let role = r.sourceRole;

      if (srcMult.includes('*') && !tgtMult.includes('*')) {
        receiving = src;
        referenced = tgt;
        referencedPk = tgtPk;
        role = r.targetRole;
      }

      const fkName = isSelf
        ? (role ? `${role.toLowerCase()}_${referencedPk.name}` : `parent_${referencedPk.name}`)
        : (role ? `${role.toLowerCase()}_${referencedPk.name}` : `${referenced.name.toLowerCase()}_${referencedPk.name}`);

      inferredFks.push({
        receivingEntityId: receiving.id,
        fkColumnName: fkName,
        fkColumnType: referencedPk.type,
        referencedEntityName: referenced.name,
        referencedPkName: referencedPk.name,
        constraintName: `fk_${receiving.name.toLowerCase()}_${fkName}`,
      });

      // Register column on receiving entity if not already present
      if (!receiving.attributes.some((a) => a.name.toLowerCase() === fkName.toLowerCase())) {
        const list = fkColsByEntityId.get(receiving.id) || [];
        if (!list.some((c) => c.name.toLowerCase() === fkName.toLowerCase())) {
          list.push({ name: fkName, type: referencedPk.type });
          fkColsByEntityId.set(receiving.id, list);
        }
      }
    }

    const lines: string[] = [];
    for (const e of entities) {
      lines.push(this.entitySql(e, fkColsByEntityId.get(e.id)));
    }

    for (const jt of junctionTables) {
      lines.push(jt);
    }

    for (const fk of inferredFks) {
      const receivingEntity = entities.find((e) => e.id === fk.receivingEntityId);
      if (!receivingEntity) continue;
      lines.push(
        `ALTER TABLE ${receivingEntity.name}\n` +
        `  ADD CONSTRAINT ${fk.constraintName}\n` +
        `  FOREIGN KEY (${fk.fkColumnName}) REFERENCES ${fk.referencedEntityName} (${fk.referencedPkName});`
      );
    }

    return lines.join('\n\n') + '\n';
  }

  toJson(selectedIds?: string[]): string {
    const state = this.diagram.getState();
    if (!selectedIds || selectedIds.length === 0) {
      return JSON.stringify(state, null, 2);
    }
    const idSet = new Set(selectedIds);
    const filteredEntities = (state.entities || []).filter((e) => idSet.has(e.id));
    const filteredRelations = (state.relations || []).filter(
      (r) => idSet.has(r.sourceId) && idSet.has(r.targetId)
    );
    return JSON.stringify(
      {
        ...state,
        entities: filteredEntities,
        relations: filteredRelations,
      },
      null,
      2
    );
  }

  async toPng(element: HTMLElement, filename: string, selectedIds?: string[]): Promise<void> {
    try {
      const idSet = selectedIds && selectedIds.length > 0 ? new Set(selectedIds) : null;
      let allowedRelIds: Set<string> | null = null;
      if (idSet) {
        allowedRelIds = new Set(
          this.diagram
            .relations()
            .filter((r) => idSet.has(r.sourceId) && idSet.has(r.targetId))
            .map((r) => r.id)
        );
      }

      const dataUrl = await toPng(element, {
        backgroundColor: '#121316',
        pixelRatio: 2,
        cacheBust: true,
        filter: (node: HTMLElement) => {
          if (!node || !node.tagName) return true;
          const tag = node.tagName.toLowerCase();
          if (tag === 'f-minimap' || tag === 'f-selection-area') return false;
          if (node.classList?.contains('group/ql')) return false;

          if (idSet) {
            // Check if node is an entity-node
            if (node.classList?.contains('entity-node') || node.hasAttribute('fNodeId')) {
              const nodeId = node.getAttribute('fNodeId') || node.getAttribute('data-agent-entity-id');
              if (nodeId && !idSet.has(nodeId)) {
                return false;
              }
            }

            // Check if node is a connection
            if (node.hasAttribute('fConnectionId')) {
              const connId = node.getAttribute('fConnectionId');
              if (connId && allowedRelIds && !allowedRelIds.has(connId)) {
                return false;
              }
            }
          }

          return true;
        },
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      this.download(filename, blob);
    } catch (err) {
      console.error('PNG export failed', err);
      throw err;
    }
  }

  downloadSql(selectedIds?: string[]): void {
    this.download('schema.sql', new Blob([this.toSql(selectedIds)], { type: 'text/sql' }));
  }

  downloadJson(selectedIds?: string[]): void {
    this.download('diagram.json', new Blob([this.toJson(selectedIds)], { type: 'application/json' }));
  }

  downloadXmi(boardId: string, filename: string = 'diagram.xmi', selectedIds?: string[]): Observable<Blob> {
    const query = selectedIds && selectedIds.length > 0 ? `?class_ids=${selectedIds.join(',')}` : '';
    return this.http
      .get(`${environment.apiUrl}/boards/${boardId}/export/xmi${query}`, {
        responseType: 'blob',
      })
      .pipe(
        tap((blob) => {
          this.download(filename, blob);
        })
      );
  }

  private entitySql(e: DBEntity, extraCols?: Array<{ name: string; type: string }>): string {
    // Filter out any legacy/redundant fk attributes in pure UML
    const normalAttrs = (e.attributes || []).filter((a) => !a.fk);
    const cols = normalAttrs.map((a) => {
      const parts = [`  ${a.name} ${a.type}`];
      if (a.pk) parts.push('PRIMARY KEY');
      if (!a.nullable && !a.pk) parts.push('NOT NULL');
      return parts.join(' ');
    });

    if (extraCols) {
      for (const col of extraCols) {
        if (!normalAttrs.some((a) => a.name.toLowerCase() === col.name.toLowerCase())) {
          cols.push(`  ${col.name} ${col.type}`);
        }
      }
    }

    return `CREATE TABLE ${e.name} (\n${cols.join(',\n')}\n);`;
  }

  private download(filename: string, data: Blob | string): void {
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}