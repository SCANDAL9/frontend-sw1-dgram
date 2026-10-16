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
      const allEntities = this.diagram.entities();
      const entities =
        selectedIds && selectedIds.length > 0
          ? allEntities.filter((e) => selectedIds.includes(e.id))
          : allEntities;

      if (entities.length === 0) {
        throw new Error('No hay elementos para exportar');
      }

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

      // Calculate bounding box of entities to export
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const e of entities) {
        const nodeEl = element.querySelector(
          `[data-entity-id="${e.id}"], [fNodeId="${e.id}"]`
        ) as HTMLElement | null;
        const w = nodeEl?.offsetWidth || e.width || 220;
        const h = nodeEl?.offsetHeight || e.height || (70 + (e.attributes?.length || 0) * 28);
        minX = Math.min(minX, e.position.x);
        minY = Math.min(minY, e.position.y);
        maxX = Math.max(maxX, e.position.x + w);
        maxY = Math.max(maxY, e.position.y + h);
      }

      const PADDING = 80;
      const exportWidth = Math.round(maxX - minX + PADDING * 2);
      const exportHeight = Math.round(maxY - minY + PADDING * 2);

      const fCanvas = element.querySelector('f-canvas') as HTMLElement | null;
      const originalTransform = fCanvas?.style.transform;
      const originalTransition = fCanvas?.style.transition;

      // Capture original container dimensions and background
      const originalElementWidth = element.style.width;
      const originalElementHeight = element.style.height;
      const originalElementMaxWidth = element.style.maxWidth;
      const originalElementMaxHeight = element.style.maxHeight;
      const originalElementBg = element.style.backgroundColor;

      // Resolve exact canvas background color from active theme to eliminate edge color mismatch
      const canvasWrapper = element.parentElement;
      const computedBg = canvasWrapper
        ? getComputedStyle(canvasWrapper).backgroundColor
        : getComputedStyle(element).backgroundColor;
      const resolvedBg =
        computedBg && computedBg !== 'transparent' && computedBg !== 'rgba(0, 0, 0, 0)'
          ? computedBg
          : '#0b0f19';

      // Ensure all connection SVG paths and markers (polygons, polylines) have explicit SVG presentation
      // attributes (fill, stroke, stroke-width, stroke-dasharray). In Chromium, computed styles on SVG elements
      // are omitted from document.documentElement stylesheet serialization during html-to-image cloning.
      // Explicit XML presentation attributes guarantee that curves, lines, diamonds and triangles render crisply.
      const allConnectionPaths = Array.from(
        element.querySelectorAll<SVGPathElement>(
          'f-connection path, svg.f-connection path, .f-connection-group path'
        )
      );
      const markerPolygons = Array.from(
        element.querySelectorAll<SVGPolygonElement>('f-connection polygon')
      );
      const markerPolylines = Array.from(
        element.querySelectorAll<SVGPolylineElement>('f-connection polyline')
      );

      const originalSvgAttrs = new Map<
        SVGElement,
        {
          fill: string | null;
          stroke: string | null;
          strokeWidth: string | null;
          strokeDasharray: string | null;
          opacity: string | null;
          display: string | null;
        }
      >();

      const saveOriginalAttrs = (el: SVGElement) => {
        originalSvgAttrs.set(el, {
          fill: el.getAttribute('fill'),
          stroke: el.getAttribute('stroke'),
          strokeWidth: el.getAttribute('stroke-width'),
          strokeDasharray: el.getAttribute('stroke-dasharray'),
          opacity: el.getAttribute('opacity'),
          display: el.getAttribute('display'),
        });
      };

      for (const p of allConnectionPaths) {
        saveOriginalAttrs(p);
        p.setAttribute('fill', 'none');

        const isSelection =
          p.hasAttribute('fconnectionselection') ||
          p.hasAttribute('fConnectionSelection') ||
          p.classList?.contains('f-connection-selection') ||
          p.getAttributeNames?.().some((attr) => attr.toLowerCase() === 'fconnectionselection');

        if (isSelection) {
          p.setAttribute('stroke', 'none');
          p.setAttribute('opacity', '0');
        } else {
          p.setAttribute('stroke', '#94a3b8');
          p.setAttribute('stroke-width', '1.5');

          const connParent = p.closest('f-connection');
          const isDashed =
            connParent?.classList?.contains('dashed-line') ||
            connParent?.classList?.contains('dashed') ||
            connParent?.classList?.contains('uml-assoc-class-connector') ||
            connParent?.classList?.contains('uml-realization');
          if (isDashed) {
            p.setAttribute('stroke-dasharray', '6,4');
          }
        }
      }

      for (const poly of markerPolygons) {
        saveOriginalAttrs(poly);
        const cls = poly.getAttribute('class') || '';
        if (cls.includes('uml-marker-diamond-hollow') || cls.includes('uml-marker-triangle')) {
          poly.setAttribute('fill', '#090d16');
          poly.setAttribute('stroke', '#94a3b8');
          poly.setAttribute('stroke-width', '1.5');
        } else {
          // Filled markers (Composition diamonds, etc.)
          poly.setAttribute('fill', '#94a3b8');
          poly.setAttribute('stroke', '#94a3b8');
          poly.setAttribute('stroke-width', '1.5');
        }
      }

      for (const pline of markerPolylines) {
        saveOriginalAttrs(pline);
        pline.setAttribute('fill', 'none');
        pline.setAttribute('stroke', '#94a3b8');
        pline.setAttribute('stroke-width', '1.5');
      }

      // Hide all waypoint handles, circles, and ellipses within connections (Foblex renders circles that default to black in SVG export)
      const waypointElements = Array.from(
        element.querySelectorAll<SVGElement>(
          'f-connection-waypoints, f-connection-waypoints *, f-connection circle, f-connection ellipse, .f-waypoint, .f-connection-waypoint-circle, .uml-waypoints-no-handles'
        )
      );
      for (const el of waypointElements) {
        saveOriginalAttrs(el);
        el.setAttribute('display', 'none');
        el.setAttribute('opacity', '0');
      }

      let dataUrl: string;
      try {
        // Expand flow container to match export canvas dimensions so background pattern/color covers 100% of the image
        element.style.width = `${exportWidth}px`;
        element.style.height = `${exportHeight}px`;
        element.style.maxWidth = 'none';
        element.style.maxHeight = 'none';
        element.style.backgroundColor = resolvedBg;

        if (fCanvas) {
          fCanvas.style.transition = 'none';
          fCanvas.style.transform = `translate(${-minX + PADDING}px, ${-minY + PADDING}px) scale(1)`;
        }

        dataUrl = await toPng(element, {
          width: exportWidth,
          height: exportHeight,
          backgroundColor: resolvedBg,
          pixelRatio: 2,
          cacheBust: true,
          filter: (node: HTMLElement) => {
            if (!node || !node.tagName) return true;
            const tag = node.tagName.toLowerCase();
            if (
              tag === 'f-minimap' ||
              tag === 'f-selection-area' ||
              tag === 'app-alignment-toolbar' ||
              tag === 'app-quick-linker' ||
              tag === 'f-connection-waypoints'
            ) {
              return false;
            }
            // Filter out waypoint handles, circles, ellipses, invisible hitboxes, and editor drag handles
            const isSelectionNode =
              node.hasAttribute('fconnectionselection') ||
              node.hasAttribute('fConnectionSelection') ||
              node.classList?.contains('f-connection-selection') ||
              node.getAttributeNames?.().some((attr) => attr.toLowerCase() === 'fconnectionselection');

            if (
              isSelectionNode ||
              node.hasAttribute('f-connection-drag-handle-start') ||
              node.hasAttribute('f-connection-drag-handle-end') ||
              node.classList?.contains('f-connection-drag-handle') ||
              node.classList?.contains('f-waypoint') ||
              node.classList?.contains('f-connection-waypoint-circle') ||
              node.classList?.contains('uml-waypoints-no-handles') ||
              node.closest?.('f-connection-waypoints') !== null ||
              (node.closest?.('f-connection') !== null && (tag === 'circle' || tag === 'ellipse')) ||
              node.getAttribute('fNodeId')?.endsWith('-midpoint-node') ||
              node.classList?.contains('uml-resize-handle')
            ) {
              return false;
            }
            if (
              node.classList?.contains('group/ql') ||
              node.classList?.contains('alignment-toolbar') ||
              node.classList?.contains('f-selection-area')
            ) {
              return false;
            }

            if (idSet) {
              // Check if node is an entity-node
              if (node.classList?.contains('entity-node') || node.hasAttribute('fNodeId')) {
                const nodeId =
                  node.getAttribute('fNodeId') ||
                  node.getAttribute('data-entity-id') ||
                  node.getAttribute('data-agent-entity-id');
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
      } finally {
        element.style.width = originalElementWidth;
        element.style.height = originalElementHeight;
        element.style.maxWidth = originalElementMaxWidth;
        element.style.maxHeight = originalElementMaxHeight;
        element.style.backgroundColor = originalElementBg;

        if (fCanvas) {
          fCanvas.style.transform = originalTransform || '';
          fCanvas.style.transition = originalTransition || '';
        }
        for (const [el, attrs] of originalSvgAttrs.entries()) {
          if (attrs.fill === null) el.removeAttribute('fill');
          else el.setAttribute('fill', attrs.fill);

          if (attrs.stroke === null) el.removeAttribute('stroke');
          else el.setAttribute('stroke', attrs.stroke);

          if (attrs.strokeWidth === null) el.removeAttribute('stroke-width');
          else el.setAttribute('stroke-width', attrs.strokeWidth);

          if (attrs.strokeDasharray === null) el.removeAttribute('stroke-dasharray');
          else el.setAttribute('stroke-dasharray', attrs.strokeDasharray);

          if (attrs.opacity === null) el.removeAttribute('opacity');
          else el.setAttribute('opacity', attrs.opacity);

          if (attrs.display === null) el.removeAttribute('display');
          else el.setAttribute('display', attrs.display);
        }
      }

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