import { Injectable, inject, computed, signal } from '@angular/core';
import { IPoint } from '@foblex/2d';
import { DiagramService } from './diagram.service';
import { EdgeRouterService, NodeRect as RouterNodeRect, RoutedEdge, ConnectorSide } from './edge-router.service';
import { DBEntity, DBRelation } from '../models/diagram.model';

@Injectable({
  providedIn: 'root',
})
export class CanvasEdgeService {
  private diagram = inject(DiagramService);
  private edgeRouter = inject(EdgeRouterService);

  private readonly assocMidpointMap = signal<Map<string, { x: number; y: number }>>(new Map());

  readonly visibleEntities = computed(() => {
    return this.diagram.entities().filter((e) => e.is_visible !== false && e.isVisible !== false);
  });

  readonly validRelations = computed(() => {
    const entityMap = new Map(this.visibleEntities().map((e) => [e.id, e]));
    return this.diagram.relations().filter((r) => entityMap.has(r.sourceId) && entityMap.has(r.targetId));
  });

  readonly entityRects = computed<RouterNodeRect[]>(() => {
    return this.visibleEntities().map((e) => ({
      id: e.id,
      x: e.position.x,
      y: e.position.y,
      width: e.width ?? 240,
      height: e.height ?? 160,
    }));
  });

  readonly edgeRouteMap = computed<Map<string, RoutedEdge>>(() => {
    const rects = this.entityRects();
    const relations = this.validRelations();
    const map = new Map<string, RoutedEdge>();

    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();

    for (const rel of relations) {
      const pairKey = [rel.sourceId, rel.targetId].sort().join('::');
      pairIndex.set(rel.id, pairCount.get(pairKey) ?? 0);
      pairCount.set(pairKey, (pairCount.get(pairKey) ?? 0) + 1);
    }

    for (const rel of relations) {
      const parallelIdx = pairIndex.get(rel.id) ?? 0;
      const routed = this.edgeRouter.route(rel.sourceId, rel.targetId, rects, parallelIdx);
      map.set(rel.id, routed);
    }

    return map;
  });

  readonly edgeSlotMap = computed<Map<string, { sourceConnector: string; targetConnector: string }>>(() => {
    const relations = this.validRelations();
    const routeMap = this.edgeRouteMap();
    const entities = this.diagram.entities();
    const entityPos = new Map(entities.map((e) => [e.id, e.position]));

    const sideGroups = new Map<
      string,
      Array<{ relId: string; oppositePos: { x: number; y: number }; isSource: boolean }>
    >();

    for (const rel of relations) {
      if (rel.sourceId === rel.targetId) continue;
      const routed = routeMap.get(rel.id);
      if (!routed) continue;

      const srcKey = `${rel.sourceId}:${routed.sourceSide}`;
      const dstKey = `${rel.targetId}:${routed.targetSide}`;

      const srcOpposite = entityPos.get(rel.targetId) ?? { x: 0, y: 0 };
      const dstOpposite = entityPos.get(rel.sourceId) ?? { x: 0, y: 0 };

      if (!sideGroups.has(srcKey)) sideGroups.set(srcKey, []);
      sideGroups.get(srcKey)!.push({ relId: rel.id, oppositePos: srcOpposite, isSource: true });

      if (!sideGroups.has(dstKey)) sideGroups.set(dstKey, []);
      sideGroups.get(dstKey)!.push({ relId: rel.id, oppositePos: dstOpposite, isSource: false });
    }

    const resultMap = new Map<string, { sourceConnector: string; targetConnector: string }>();
    for (const rel of relations) {
      resultMap.set(rel.id, { sourceConnector: '', targetConnector: '' });
    }

    for (const [key, group] of sideGroups.entries()) {
      const [nodeId, side] = key.split(':') as [string, ConnectorSide];
      const isVerticalFace = side === 'left' || side === 'right';

      group.sort((a, b) =>
        isVerticalFace ? a.oppositePos.y - b.oppositePos.y : a.oppositePos.x - b.oppositePos.x
      );

      const n = group.length;
      let slots: number[] = [];
      if (isVerticalFace) {
        if (n === 1) slots = [2];
        else if (n === 2) slots = [1, 3];
        else if (n === 3) slots = [1, 2, 3];
        else if (n === 4) slots = [0, 1, 3, 4];
        else slots = group.map((_, i) => Math.min(i, 4));
      } else {
        if (n === 1) slots = [1];
        else if (n === 2) slots = [0, 2];
        else slots = group.map((_, i) => Math.min(i, 2));
      }

      for (let i = 0; i < n; i++) {
        const item = group[i];
        const slotIdx = slots[i] ?? 2;
        const connectorId = `${nodeId}@class-${side}-${slotIdx}`;
        const entry = resultMap.get(item.relId)!;
        if (item.isSource) {
          entry.sourceConnector = connectorId;
        } else {
          entry.targetConnector = connectorId;
        }
      }
    }

    return resultMap;
  });

  getRelationMidpoint(rel: DBRelation): { x: number; y: number } {
    if (rel.associationClassId) {
      const cached = this.assocMidpointMap().get(rel.id);
      if (cached) return cached;
      return this.centerToCenterMidpoint(rel);
    }

    const src = this.diagram.getEntity(rel.sourceId);
    const tgt = this.diagram.getEntity(rel.targetId);
    if (!src || !tgt) return { x: 0, y: 0 };

    const getBox = (e: DBEntity) => ({
      x: e.position.x,
      y: e.position.y,
      w: e.width ?? 240,
      h: e.height ?? 160,
    });

    const srcBox = getBox(src);
    const tgtBox = getBox(tgt);
    const routed = this.edgeRouteMap().get(rel.id);
    const srcSide = routed?.sourceSide ?? 'right';
    const tgtSide = routed?.targetSide ?? 'left';

    const getAnchor = (box: { x: number; y: number; w: number; h: number }, side: ConnectorSide) => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      switch (side) {
        case 'top':
          return { x: cx, y: box.y };
        case 'bottom':
          return { x: cx, y: box.y + box.h };
        case 'left':
          return { x: box.x, y: cy };
        case 'right':
          return { x: box.x + box.w, y: cy };
        default:
          return { x: cx, y: cy };
      }
    };

    const srcAnchor = getAnchor(srcBox, srcSide);
    const tgtAnchor = getAnchor(tgtBox, tgtSide);

    let polyline: { x: number; y: number }[];
    if (routed?.waypoints && routed.waypoints.length > 0) {
      polyline = [srcAnchor, ...routed.waypoints, tgtAnchor];
    } else if (srcSide === 'right' && tgtSide === 'left') {
      const gapX = tgtAnchor.x - 16;
      polyline = [srcAnchor, { x: gapX, y: srcAnchor.y }, { x: gapX, y: tgtAnchor.y }, tgtAnchor];
    } else if (srcSide === 'left' && tgtSide === 'right') {
      const gapX = tgtAnchor.x + 16;
      polyline = [srcAnchor, { x: gapX, y: srcAnchor.y }, { x: gapX, y: tgtAnchor.y }, tgtAnchor];
    } else if (srcSide === 'bottom' && tgtSide === 'top') {
      const gapY = tgtAnchor.y - 16;
      polyline = [srcAnchor, { x: srcAnchor.x, y: gapY }, { x: tgtAnchor.x, y: gapY }, tgtAnchor];
    } else if (srcSide === 'top' && tgtSide === 'bottom') {
      const gapY = tgtAnchor.y + 16;
      polyline = [srcAnchor, { x: srcAnchor.x, y: gapY }, { x: tgtAnchor.x, y: gapY }, tgtAnchor];
    } else {
      polyline = [srcAnchor, tgtAnchor];
    }

    return this.calcPolylineMidpoint(polyline);
  }

  refreshAssocMidpoints(): void {
    const relations = this.validRelations().filter((r) => r.associationClassId);
    if (relations.length === 0) return;

    const current = this.assocMidpointMap();
    const next = new Map(current);
    let changed = false;

    for (const rel of relations) {
      const host = document.querySelector<Element>(`[data-rel-id="${rel.id}"]`);
      const pathEl = host?.querySelector<SVGPathElement>('path');

      if (!pathEl) continue;

      const totalLen = pathEl.getTotalLength();
      if (totalLen === 0) continue;

      const pt = pathEl.getPointAtLength(totalLen / 2);
      const nx = Math.round(pt.x);
      const ny = Math.round(pt.y);

      const prev = current.get(rel.id);
      if (!prev || prev.x !== nx || prev.y !== ny) {
        next.set(rel.id, { x: nx, y: ny });
        changed = true;
      }
    }

    for (const key of current.keys()) {
      if (!relations.find((r) => r.id === key)) {
        next.delete(key);
        changed = true;
      }
    }

    if (changed) {
      this.assocMidpointMap.set(next);
    }
  }

  centerToCenterMidpoint(rel: DBRelation): { x: number; y: number } {
    const src = this.diagram.getEntity(rel.sourceId);
    const tgt = this.diagram.getEntity(rel.targetId);
    if (!src || !tgt) return { x: 0, y: 0 };
    return {
      x: Math.round((src.position.x + (src.width ?? 240) / 2 + tgt.position.x + (tgt.width ?? 240) / 2) / 2),
      y: Math.round((src.position.y + (src.height ?? 160) / 2 + tgt.position.y + (tgt.height ?? 160) / 2) / 2),
    };
  }

  getAssocClassInputConnector(rel: DBRelation): string {
    if (!rel.associationClassId) return '';
    const assoc = this.diagram.getEntity(rel.associationClassId);
    if (!assoc) return `${rel.associationClassId}@class-bottom-1`;

    const mid = this.getRelationMidpoint(rel);
    const w = assoc.width ?? 240;
    const attrCount = Math.max(1, assoc.attributes?.length ?? 0);
    const hasPkg = !!assoc.packageId;
    const h = assoc.height ?? (hasPkg ? 54 : 44) + attrCount * 26 + 12;

    const assocCenterX = assoc.position.x + w / 2;
    const assocCenterY = assoc.position.y + h / 2;
    const dx = assocCenterX - mid.x;
    const dy = assocCenterY - mid.y;

    if (Math.abs(dy) >= Math.abs(dx)) {
      return dy < 0
        ? `${rel.associationClassId}@class-bottom-1`
        : `${rel.associationClassId}@class-top-1`;
    } else {
      return dx < 0
        ? `${rel.associationClassId}@class-right-2`
        : `${rel.associationClassId}@class-left-2`;
    }
  }

  private calcPolylineMidpoint(pts: { x: number; y: number }[]): { x: number; y: number } {
    if (pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1) return pts[0];
    if (pts.length === 2) {
      return {
        x: Math.round((pts[0].x + pts[1].x) / 2),
        y: Math.round((pts[0].y + pts[1].y) / 2),
      };
    }

    let totalLen = 0;
    const segLens: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segLens.push(len);
      totalLen += len;
    }

    const half = totalLen / 2;
    let accumulated = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (accumulated + segLens[i] >= half) {
        const remaining = half - accumulated;
        const ratio = segLens[i] > 0 ? remaining / segLens[i] : 0;
        return {
          x: Math.round(pts[i].x + (pts[i + 1].x - pts[i].x) * ratio),
          y: Math.round(pts[i].y + (pts[i + 1].y - pts[i].y) * ratio),
        };
      }
      accumulated += segLens[i];
    }
    return pts[pts.length - 1];
  }

  resolveSourceConnector(rel: DBRelation): string {
    if (rel.sourceId === rel.targetId) {
      return `${rel.sourceId}@class-out`;
    }
    const slotConnector = this.edgeSlotMap().get(rel.id)?.sourceConnector;
    if (slotConnector) return slotConnector;

    if (rel.sourceColumn) {
      const entity = this.diagram.getEntity(rel.sourceId);
      if (entity?.attributes.some((a) => a.name === rel.sourceColumn)) {
        return `${rel.sourceId}:${rel.sourceColumn}@out`;
      }
    }

    const routed = this.edgeRouteMap().get(rel.id);
    const side = routed?.sourceSide ?? 'right';
    return this.connectorIdForSide(rel.sourceId, side);
  }

  resolveTargetConnector(rel: DBRelation): string {
    if (rel.sourceId === rel.targetId) {
      return `${rel.targetId}@class-top`;
    }
    const slotConnector = this.edgeSlotMap().get(rel.id)?.targetConnector;
    if (slotConnector) return slotConnector;

    if (rel.targetColumn) {
      const entity = this.diagram.getEntity(rel.targetId);
      if (entity?.attributes.some((a) => a.name === rel.targetColumn)) {
        return `${rel.targetId}:${rel.targetColumn}@in`;
      }
    }

    const routed = this.edgeRouteMap().get(rel.id);
    const side = routed?.targetSide ?? 'left';
    return this.connectorIdForSide(rel.targetId, side, true);
  }

  connectorIdForSide(entityId: string, side: ConnectorSide, isInput = false): string {
    switch (side) {
      case 'top':
        return `${entityId}@class-top`;
      case 'bottom':
        return `${entityId}@class-bottom`;
      case 'right':
        return `${entityId}@class-out`;
      case 'left':
        return `${entityId}@class-in`;
      default:
        return isInput ? `${entityId}@class-in` : `${entityId}@class-out`;
    }
  }

  getEdgeWaypoints(rel: DBRelation): IPoint[] {
    return this.edgeRouteMap().get(rel.id)?.waypoints ?? [];
  }

  getConnectionType(rel: DBRelation): 'segment' | 'bezier' | 'straight' | 'adaptive-curve' {
    if (this.getEdgeWaypoints(rel).length > 0) {
      return 'straight';
    }
    return 'segment';
  }

  getConnectionOffset(rel: DBRelation): number {
    if (rel.sourceId === rel.targetId) {
      return 28 + this.getParallelRelationIndex(rel) * 16;
    }
    return 16;
  }

  getParallelRelationIndex(rel: DBRelation): number {
    const pair = [rel.sourceId, rel.targetId].sort().join('::');
    const parallel = this.validRelations().filter((r) => {
      return [r.sourceId, r.targetId].sort().join('::') === pair;
    });
    return parallel.findIndex((r) => r.id === rel.id);
  }
}
