import { Component, inject, AfterViewInit, ViewChild, ElementRef, signal, HostListener, effect, computed, input, output, afterRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  FFlowModule,
  provideFFlow,
  withA11y,
  FFlowComponent,
  FCanvasComponent,
  FZoomDirective,
  FMoveNodesEvent,
  FSelectionChangeEvent,
  FDeleteSelectedEvent,
  FCanvasChangeEvent,
} from '@foblex/flow';
import { IPoint } from '@foblex/2d';
import { DiagramService } from '../../services/diagram.service';
import { CommandService } from '../../services/command.service';
import { SelectionService } from '../../services/selection.service';
import { WebsocketService, RemoteCursor, Peer } from '../../services/websocket.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastService } from '../../../../core/services/toast.service';
import { TableNodeComponent } from './table-node/table-node.component';
import { DBRelation, ClassifierType, DBAttribute, DBEntity } from '../../models/diagram.model';
import { SmartGuidesService, GuideLine, NodeRect } from '../../services/smart-guides.service';
import { LayoutService } from '../../services/layout.service';
import { ProactivityService } from '../../../ai/services/proactivity.service';
import { CanvasShortcutsService } from '../../services/canvas-shortcuts.service';
import { QuickLinkerComponent, QuickLinkerPosition } from './quick-linker/quick-linker.component';
import { CanvasContextMenuComponent, CanvasContextMenuState } from './context-menu/canvas-context-menu.component';
import { AlignmentToolbarComponent } from './alignment-toolbar/alignment-toolbar.component';
import { RelationCardinalityPipe, MultiplicityMeaningPipe } from '../../pipes/relation-cardinality.pipe';
import { IsDashedRelationPipe, RelationCategoryPipe, getRelationCategory } from '../../pipes/relation-symbol.pipe';
import { EdgeRouterService, NodeRect as RouterNodeRect, RoutedEdge, ConnectorSide } from '../../services/edge-router.service';


@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FFlowModule,
    TableNodeComponent,
    QuickLinkerComponent,
    CanvasContextMenuComponent,
    AlignmentToolbarComponent,
    RelationCardinalityPipe,
    MultiplicityMeaningPipe,
    IsDashedRelationPipe,
    RelationCategoryPipe,
  ],
  providers: [provideFFlow(withA11y())],
  templateUrl: './canvas.component.html',
})
export class CanvasComponent implements AfterViewInit {
  @ViewChild(FFlowComponent, { read: ElementRef }) flowHost?: ElementRef<HTMLElement>;
  @ViewChild(FFlowComponent) flow!: FFlowComponent;
  @ViewChild(FCanvasComponent) canvas?: FCanvasComponent;
  @ViewChild(FZoomDirective) zoom?: FZoomDirective;

  diagram = inject(DiagramService);
  cmd = inject(CommandService);
  selection = inject(SelectionService);
  ws = inject(WebsocketService);
  theme = inject(ThemeService);
  toast = inject(ToastService);
  smartGuides = inject(SmartGuidesService);
  layoutSvc = inject(LayoutService);
  proactivity = inject(ProactivityService);
  shortcuts = inject(CanvasShortcutsService);
  private edgeRouter = inject(EdgeRouterService);

  private moveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  boardId = input.required<string>();
  isSidebarOpen = input<boolean>(true);

  toggleSidebar = output<void>();
  openCodegen = output<void>();
  openMembers = output<void>();
  openCommandPalette = output<void>();
  openChat = output<void>();
  catalogChanged = output<void>();
  entitySelected = output<string | null>();
  relationSelected = output<string | null>();
  detachClass = output<string>();
  deleteClassFromModel = output<string>();
  selectedEntityId = signal<string | null>(null);
  selectedEntityIds = signal<string[]>([]);
  selectedRelationId = signal<string | null>(null);
  hoveredEntityId = signal<string | null>(null);
  hoveredRelationId = signal<string | null>(null);
  highlightedEntityId = signal<string | null>(null);
  activeGuides = signal<GuideLine[]>([]);

  quickLinkerSourceId = signal<string | null>(null);
  showQuickLinkerMenu = signal<QuickLinkerPosition | null>(null);
  zoomPercent = signal(100);
  canvasPan = signal({ x: 0, y: 0 });
  canvasScale = signal(1);
  lineType = signal<'segment' | 'bezier' | 'straight' | 'adaptive-curve'>('segment');
  gridType = signal<'dots' | 'lines' | 'none'>('dots');
  showMinimap = signal(true);
  contextMenu = signal<CanvasContextMenuState | null>(null);

  rightClickBox = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private rightClickStart: { x: number; y: number } | null = null;
  private isRightDragging = false;
  private pendingContextMenu: CanvasContextMenuState | null = null;

  isPanning = signal(false);
  private panStart = { x: 0, y: 0 };
  private panOrigin = { x: 0, y: 0 };
  private lastCursorSend = 0;

  /**
   * Ground-truth midpoints read directly from the rendered SVG paths.
   * Populated by afterRender using the W3C SVGPathElement API.
   * Falls back to center-to-center when the path is not yet in the DOM.
   */
  private readonly assocMidpointMap = signal<Map<string, { x: number; y: number }>>(new Map());

  constructor() {
    afterRender(() => this.refreshAssocMidpoints());
  }

  readonly remoteCursors = computed(() => Object.values(this.ws.cursors()));
  readonly selectedRelation = computed(() => {
    const id = this.selectedRelationId();
    return id ? this.diagram.relations().find((r) => r.id === id) ?? null : null;
  });

  activeMultiplicityRelId = signal<string | null>(null);
  readonly activeMultiplicityRel = computed(() => {
    const id = this.activeMultiplicityRelId();
    return id ? this.diagram.relations().find((r) => r.id === id) ?? null : null;
  });

  readonly visibleEntities = computed(() => {
    return this.diagram.entities().filter((e) => e.is_visible !== false && e.isVisible !== false);
  });

  readonly validRelations = computed(() => {
    const entityMap = new Map(this.visibleEntities().map((e) => [e.id, e]));
    return this.diagram.relations().filter((r) => entityMap.has(r.sourceId) && entityMap.has(r.targetId));
  });

  /** Map each visible entity to a RouterNodeRect for the edge routing algorithm */
  readonly entityRects = computed<RouterNodeRect[]>(() => {
    return this.visibleEntities().map((e) => ({
      id: e.id,
      x: e.position.x,
      y: e.position.y,
      width: e.width ?? 240,
      height: e.height ?? 160,
    }));
  });

  /**
   * Pre-computed routing for every visible relation.
   * Keys are relation IDs; values contain waypoints and resolved source/target sides.
   * Re-computes when entities move or relations change.
   */
  readonly edgeRouteMap = computed<Map<string, RoutedEdge>>(() => {
    const rects = this.entityRects();
    const relations = this.validRelations();
    const map = new Map<string, RoutedEdge>();

    // Group relations by (sourceId, targetId) pair to detect parallels
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

  /**
   * Computes distributed connector slots along node faces so multiple edges
   * attaching to the same face don't clump at the same pixel.
   */
  readonly edgeSlotMap = computed<Map<string, { sourceConnector: string; targetConnector: string }>>(() => {
    const relations = this.validRelations();
    const routeMap = this.edgeRouteMap();
    const entities = this.diagram.entities();
    const entityPos = new Map(entities.map((e) => [e.id, e.position]));

    // Group relations attaching to (nodeId, side)
    const sideGroups = new Map<string, Array<{ relId: string; oppositePos: { x: number; y: number }; isSource: boolean }>>();

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

      // Sort by opposite coordinate (Y for vertical face, X for horizontal face) to prevent crossings
      group.sort((a, b) => isVerticalFace
        ? a.oppositePos.y - b.oppositePos.y
        : a.oppositePos.x - b.oppositePos.x
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

  /**
   * Returns the midpoint for a relation.
   *
   * For association-class relations the ground truth comes from the rendered SVG
   * path (read by afterRender via refreshAssocMidpoints). This guarantees the
   * junction dot sits exactly on the drawn line regardless of Foblex's internal
   * routing algorithm. A center-to-center value is used as the initial fallback
   * until the first afterRender cycle populates the map.
   *
   * For ordinary relations the polyline midpoint is sufficient (used by label
   * placement, etc.).
   */
  getRelationMidpoint(rel: DBRelation): { x: number; y: number } {
    // Fast path: return the DOM-read midpoint when available
    if (rel.associationClassId) {
      const cached = this.assocMidpointMap().get(rel.id);
      if (cached) return cached;

      // Fallback until afterRender populates the map
      return this.centerToCenterMidpoint(rel);
    }

    // ── Ordinary relation: reconstruct the Manhattan polyline ─────────────────
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
        case 'top':    return { x: cx,          y: box.y };
        case 'bottom': return { x: cx,          y: box.y + box.h };
        case 'left':   return { x: box.x,       y: cy };
        case 'right':  return { x: box.x + box.w, y: cy };
        default:       return { x: cx,          y: cy };
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

  /**
   * Reads the actual rendered SVG path for every relation that has an
   * association class and stores the geometric midpoint (at 50% path length)
   * into assocMidpointMap.
   *
   * Called by afterRender so it always runs after Foblex has finished painting.
   * Uses the W3C SVGPathElement API — independent of Foblex internals.
   */
  private refreshAssocMidpoints(): void {
    const relations = this.validRelations().filter((r) => r.associationClassId);
    if (relations.length === 0) return;

    const current = this.assocMidpointMap();
    const next = new Map(current);
    let changed = false;

    for (const rel of relations) {
      // [fConnectionId] is an Angular @Input — it is NOT rendered as an HTML
      // attribute. We use [attr.data-rel-id] on the f-connection element in the
      // template instead, which IS a real DOM attribute we can query reliably.
      const host = document.querySelector<Element>(`[data-rel-id="${rel.id}"]`);
      const pathEl = host?.querySelector<SVGPathElement>('path');

      if (!pathEl) {
        // Path not yet in the DOM — keep existing value or fall back below
        continue;
      }

      const totalLen = pathEl.getTotalLength();
      if (totalLen === 0) continue;

      // getPointAtLength returns a point in the SVG's local coordinate space,
      // which in Foblex matches canvas coordinates (same space as entity.position).
      const pt = pathEl.getPointAtLength(totalLen / 2);
      const nx = Math.round(pt.x);
      const ny = Math.round(pt.y);

      const prev = current.get(rel.id);
      if (!prev || prev.x !== nx || prev.y !== ny) {
        next.set(rel.id, { x: nx, y: ny });
        changed = true;
      }
    }

    // Remove stale entries for relations that no longer have an assoc class
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

  /**
   * Center-to-center midpoint — used as the initial fallback before the first
   * afterRender cycle reads the real SVG path coordinates.
   */
  private centerToCenterMidpoint(rel: DBRelation): { x: number; y: number } {
    const src = this.diagram.getEntity(rel.sourceId);
    const tgt = this.diagram.getEntity(rel.targetId);
    if (!src || !tgt) return { x: 0, y: 0 };
    return {
      x: Math.round((src.position.x + (src.width ?? 240) / 2 + tgt.position.x + (tgt.width ?? 240) / 2) / 2),
      y: Math.round((src.position.y + (src.height ?? 160) / 2 + tgt.position.y + (tgt.height ?? 160) / 2) / 2),
    };
  }

  /**
   * Determines the optimal facing connector on the association class
   * to connect with the relationship midpoint.
   */
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

    const halfLen = totalLen / 2;
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= halfLen) {
        const remaining = halfLen - acc;
        const t = segLens[i] > 0 ? remaining / segLens[i] : 0;
        return {
          x: Math.round(pts[i].x + t * (pts[i + 1].x - pts[i].x)),
          y: Math.round(pts[i].y + t * (pts[i + 1].y - pts[i].y)),
        };
      }
      acc += segLens[i];
    }
    return pts[Math.floor(pts.length / 2)];
  }

  readonly highlightChain = computed(() => {
    const hoverE = this.hoveredEntityId();
    const hoverR = this.hoveredRelationId();
    if (!hoverE && !hoverR) {
      return { active: false, entityIds: new Set<string>(), relationIds: new Set<string>() };
    }

    const entityIds = new Set<string>();
    const relationIds = new Set<string>();
    const relations = this.validRelations();

    if (hoverE) {
      entityIds.add(hoverE);
      for (const r of relations) {
        if (r.sourceId === hoverE || r.targetId === hoverE) {
          relationIds.add(r.id);
          entityIds.add(r.sourceId);
          entityIds.add(r.targetId);
        }
      }
    } else if (hoverR) {
      const rel = relations.find((r) => r.id === hoverR);
      if (rel) {
        relationIds.add(rel.id);
        entityIds.add(rel.sourceId);
        entityIds.add(rel.targetId);
      }
    }

    return { active: true, entityIds, relationIds };
  });

  private selectionGuard = effect(() => {
    const es = this.diagram.entities();
    const sel = this.selectedEntityId();
    if (sel && !es.some((e) => e.id === sel)) {
      this.selectedEntityId.set(null);
    }

    if (this.ws.online()) {
      this.ws.sendAgentSessionSync({
        selected_element_id: sel,
        selected_element_type: sel ? 'class' : (this.selectedRelationId() ? 'relation' : null),
        active_tool: this.selection.activeTool(),
        viewport: { x: this.canvasPan().x, y: this.canvasPan().y, zoom: this.canvasScale() },
      });
    }
  });


  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.diagram.entityCount() > 2) this.fitToScreen();
      this.proactivity.checkEmptyBoard(this.diagram.entityCount());
    }, 500);
  }

  // ── Keyboard & Global Event Listeners ─────────────────────────────────────

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    this.shortcuts.handleKeyDown(e, {
      onToggleSidebar: () => this.toggleSidebar.emit(),
      onToggleCommandPalette: () => this.openCommandPalette.emit(),
      onUndo: () => this.cmd.undo(),
      onRedo: () => this.cmd.redo(),
      onDuplicate: () => this.duplicateSelection(),
      onFitToScreen: () => this.fitToScreen(),
    });
  }

  @HostListener('window:keyup', ['$event'])
  onGlobalKeyup(e: KeyboardEvent): void {
    this.shortcuts.handleKeyUp(e);
    if (e.code === 'Space') {
      this.isPanning.set(false);
    }
  }



  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(e: MouseEvent): void {
    if (this.isPanning() && this.canvas) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      const nextPan = { x: this.panOrigin.x + dx, y: this.panOrigin.y + dy };
      (this.canvas as any)._setPosition?.(nextPan);
      this.canvas.redraw();
      (this.canvas as any).emitCanvasChangeEvent?.();
      this.canvasPan.set(nextPan);
    }

    if (this.rightClickStart) {
      const dx = e.clientX - this.rightClickStart.x;
      const dy = e.clientY - this.rightClickStart.y;
      if (!this.isRightDragging && Math.hypot(dx, dy) > 4) {
        this.isRightDragging = true;
        this.pendingContextMenu = null;
        this.contextMenu.set(null);
      }
      if (this.isRightDragging) {
        const x = Math.min(this.rightClickStart.x, e.clientX);
        const y = Math.min(this.rightClickStart.y, e.clientY);
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        this.rightClickBox.set({ x, y, w, h });
        this.updateMarqueeSelection(x, y, w, h);
      }
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    this.isPanning.set(false);

    if (this.isRightDragging) {
      this.isRightDragging = false;
      this.pendingContextMenu = null;
      this.rightClickBox.set(null);
      this.rightClickStart = null;
      const ids = this.selectedEntityIds();
      if (ids.length > 0) {
        this.flow?.select(ids, []);
      }
    } else if (this.pendingContextMenu) {
      this.contextMenu.set(this.pendingContextMenu);
      this.pendingContextMenu = null;
      this.rightClickStart = null;
      this.rightClickBox.set(null);
    } else {
      this.rightClickStart = null;
      this.rightClickBox.set(null);
    }
  }

  // ── Sidebar & Explorer Actions ───────────────────────────────────────────

  // ── Selection & Entity Operations ─────────────────────────────────────────

  selectEntity(id: string): void {
    const tool = this.selection.activeTool();
    if (tool === 'relation') {
      const srcId = this.selection.pendingSourceId();
      if (!srcId) {
        this.selection.pendingSourceId.set(id);
        this.selectedEntityId.set(id);
        this.selectedEntityIds.set([id]);
        this.selectedRelationId.set(null);
        this.selection.set([id]);
        this.ws.sendSelection([id], null);
      } else {
        const relType = this.selection.currentRelationKind() || 'Association';
        const semanticError = this.validateRelationSemantics(srcId, id, relType);
        if (semanticError) {
          this.toast.error(semanticError);
          this.selection.setTool('select');
          this.selection.pendingSourceId.set(null);
          return;
        }

        if (relType.startsWith('Generalization') || relType.startsWith('Realization')) {
          if (this.wouldCreateGeneralizationCycle(srcId, id)) {
            this.toast.error('Herencia circular no permitida: crearía un ciclo en la jerarquía.');
            this.selection.setTool('select');
            this.selection.pendingSourceId.set(null);
            return;
          }
        }

        const isAssoc = getRelationCategory(relType) === 'Association';
        const defaultSrc = isAssoc ? '1' : null;
        const defaultTgt = isAssoc ? '1' : null;

        const relId = this.cmd.createRelation(
          srcId,
          id,
          '',
          '',
          relType,
          null,
          null,
          null,
          defaultSrc,
          defaultTgt
        );
        this.selection.setTool('select');
        this.selectedEntityId.set(null);
        this.selectedEntityIds.set([]);
        this.ws.sendSelection([], null);
        this.toast.info(`Relación ${relType}${srcId === id ? ' recursiva' : ''} creada`);

        if (isAssoc) {
          this.openMultiplicityConfig(relId);
        }
      }
      return;
    }

    this.selectedEntityId.set(id);
    this.selectedEntityIds.set([id]);
    this.selectedRelationId.set(null);
    this.selection.set([id]);
    this.ws.sendSelection([id], null);
    this.entitySelected.emit(id);
  }

  jumpToEntity(id: string): void {
    const e = this.diagram.getEntity(id);
    if (!e) return;
    this.selectEntity(id);
    if (this.canvas) {
      const vpWidth = this.flowHost?.nativeElement.clientWidth || 800;
      const vpHeight = this.flowHost?.nativeElement.clientHeight || 600;
      const scale = this.canvasScale() || 1;
      const targetPan = {
        x: vpWidth / 2 - (e.position.x + 120) * scale,
        y: vpHeight / 2 - (e.position.y + 80) * scale,
      };
      if (typeof (this.canvas as any)?._setPosition === 'function') {
        (this.canvas as any)._setPosition(targetPan);
      }
      this.canvasPan.set(targetPan);
    }
  }

  duplicateSelection(): void {
    for (const id of [...this.selection.ids()]) {
      const src = this.diagram.getEntity(id);
      if (!src) continue;
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : this.nextUniqueEntityId(src.name);
      const nx = src.position.x + 32 + (this.diagram.entityCount() % 3) * 8;
      const ny = src.position.y + 32 + Math.floor(this.diagram.entityCount() / 3) * 8;
      this.cmd.createEntity(
        newId,
        `${src.name}_copy`,
        src.attributes.map((a) => ({ ...a })),
        { x: nx, y: ny }
      );
    }
    this.toast.info('Elemento duplicado');
  }

  private nextUniqueEntityId(base: string): string {
    let candidate = `${base}_copy`;
    let n = 2;
    while (this.diagram.getEntity(candidate)) {
      candidate = `${base}_copy${n++}`;
    }
    return candidate;
  }

  closeSidebar(): void {
    this.selectedEntityId.set(null);
  }

  closeRelationPanel(): void {
    this.selectedRelationId.set(null);
    this.relationSelected.emit(null);
  }

  onSelectAssociation(id: string): void {
    if (this.selectedRelationId() === id) {
      this.closeRelationPanel();
      return;
    }
    this.selectedRelationId.set(id);
    this.selectedEntityId.set(null);
    this.selection.clear();
    this.relationSelected.emit(id);
  }

  readonly umlRelationOrder = [
    '1:N',
    '1:1',
    'N:M',
    'Generalization',
    'Composition',
    'Aggregation',
    'Dependency',
    'Realization',
  ];

  cycleRelationType(): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    const cat = getRelationCategory(rel.type);
    let idx = this.umlRelationOrder.indexOf(rel.type);
    if (idx === -1) {
      idx = this.umlRelationOrder.indexOf(cat);
    }
    const next = this.umlRelationOrder[(idx + 1) % this.umlRelationOrder.length];
    this.cmd.updateRelation(rel.id, { type: next });
    this.toast.info(`Relación: ${next}`);
  }

  openMultiplicityConfig(relId: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    if (rel) {
      const cat = getRelationCategory(rel.type);
      if (cat !== 'Association') return;
    }
    this.activeMultiplicityRelId.set(relId);
    this.selectedRelationId.set(relId);
    this.selectedEntityId.set(null);
    this.relationSelected.emit(relId);
  }

  closeMultiplicityConfig(): void {
    this.activeMultiplicityRelId.set(null);
  }

  setMultiplicities(relId: string, src: string, tgt: string): void {
    const ok = this.cmd.applyMultiplicityChange(relId, src, tgt);
    if (ok) {
      this.toast.info(`Multiplicidad: ${src} ➔ ${tgt}`);
    }
  }

  updateRelSourceMultiplicity(relId: string, src: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    const tgt = rel?.targetMultiplicity || '1';
    this.cmd.applyMultiplicityChange(relId, src, tgt);
  }

  updateRelTargetMultiplicity(relId: string, tgt: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    const src = rel?.sourceMultiplicity || '1';
    this.cmd.applyMultiplicityChange(relId, src, tgt);
  }

  onCardinalityClick(relId: string): void {
    this.openMultiplicityConfig(relId);
  }

  // ── Context Menu Operations ───────────────────────────────────────────────

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: MouseEvent, entityId?: string): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.isRightDragging) {
      return;
    }
    this.pendingContextMenu = {
      x: e.clientX,
      y: e.clientY,
      entityId,
    };
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  // ── Quick Linker (EA Style) ───────────────────────────────────────────────

  openQuickLinker(sourceId: string, event: MouseEvent): void {
    event.stopPropagation();
    const source = this.diagram.getEntity(sourceId);
    if (!source) return;
    this.quickLinkerSourceId.set(sourceId);
    this.showQuickLinkerMenu.set({
      x: source.position.x + 230,
      y: source.position.y + 10,
      sourceId,
    });
  }

  quickCreateLinkedClass(relType: string, classifierType: ClassifierType = 'class'): void {
    const menu = this.showQuickLinkerMenu();
    if (!menu) return;
    const src = this.diagram.getEntity(menu.sourceId);
    if (!src) return;

    const baseName = classifierType === 'interface' ? 'IInterface' : classifierType === 'enumeration' ? 'EnumKind' : 'NewClass';
    let n = 1;
    let name = `${baseName}${n}`;
    while (this.diagram.entities().some((e) => e.name === name)) {
      n++;
      name = `${baseName}${n}`;
    }

    const isBelow = relType === 'Generalization' || relType === 'Realization';
    const newPos = isBelow
      ? { x: src.position.x, y: src.position.y + 240 }
      : { x: src.position.x + 290, y: src.position.y };

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `entity-${Date.now()}`;
    this.cmd.createEntity(
      newId,
      name,
      [{ name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' }],
      newPos
    );

    if (classifierType !== 'class') {
      this.cmd.updateEntity(newId, name, {
        stereotype: classifierType,
        is_abstract: classifierType === 'abstract_class',
      });
    }

    this.cmd.createRelation(src.id, newId, '', '', relType);
    this.toast.info(`Clase ${name} creada con relación ${relType}`);

    this.showQuickLinkerMenu.set(null);
    this.quickLinkerSourceId.set(null);
  }




  // ── Alignment & Layout ───────────────────────────────────────────────────

  alignSelected(direction: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'): void {
    const ids = this.selectedEntityIds();
    if (ids.length < 2) return;
    switch (direction) {
      case 'left': this.layoutSvc.alignLeft(ids); break;
      case 'centerH': this.layoutSvc.alignCenterH(ids); break;
      case 'right': this.layoutSvc.alignRight(ids); break;
      case 'top': this.layoutSvc.alignTop(ids); break;
      case 'centerV': this.layoutSvc.alignCenterV(ids); break;
      case 'bottom': this.layoutSvc.alignBottom(ids); break;
    }
    this.toast.info('Elementos alineados');
  }

  distributeSelected(axis: 'h' | 'v'): void {
    const ids = this.selectedEntityIds();
    if (ids.length < 3) return;
    if (axis === 'h') this.layoutSvc.distributeHorizontally(ids);
    else this.layoutSvc.distributeVertically(ids);
    this.toast.info('Elementos distribuidos uniformemente');
  }

  autoLayout(): void {
    const ents = this.diagram.entities();
    if (ents.length === 0) return;

    const cols = Math.max(2, Math.ceil(Math.sqrt(ents.length)));
    const startX = 100;
    const startY = 100;
    const stepX = 320;
    const stepY = 240;

    ents.forEach((e, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const targetPos = {
        x: startX + col * stepX,
        y: startY + row * stepY,
      };
      this.cmd.moveEntity(e.id, targetPos);
    });

    setTimeout(() => {
      this.fitToScreen();
      this.toast.success('Diagrama ordenado automáticamente');
    }, 80);
  }

  onCanvasMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      this.rightClickStart = { x: e.clientX, y: e.clientY };
      this.isRightDragging = false;
    } else if (this.shortcuts.isSpacePressed() || this.selection.activeTool() === 'hand' || e.button === 1) {
      e.preventDefault();
      this.isPanning.set(true);
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panOrigin = { ...this.canvasPan() };
    }
  }

  @HostListener('wheel', ['$event'])
  onCanvasWheel(e: WheelEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.modal, .drawer, .dropdown, textarea, input, app-export-scope-modal')) {
      return;
    }

    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Shift + Wheel -> Desplazamiento Horizontal (suave y calibrado)
      e.preventDefault();
      e.stopPropagation();
      const rawDelta = e.deltaY || e.deltaX;
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 40 : 0.5;
      const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta * factor), 50);
      this.panBy(-delta, 0);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl + Wheel (con o sin Shift) -> Desplazamiento Vertical (suave y calibrado)
      e.preventDefault();
      e.stopPropagation();
      const rawDelta = e.deltaY;
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 40 : 0.5;
      const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta * factor), 50);
      this.panBy(0, -delta);
    }
    // Rueda sola (sin modificadores) -> Permite a fZoom realizar el zoom nativo sobre el lienzo
  }

  panBy(dx: number, dy: number): void {
    const current = this.canvasPan();
    const nextPan = { x: current.x + dx, y: current.y + dy };
    if (this.canvas) {
      (this.canvas as any)._setPosition?.(nextPan);
      this.canvas.redraw();
      (this.canvas as any).emitCanvasChangeEvent?.();
    }
    this.canvasPan.set(nextPan);
  }

  private updateMarqueeSelection(boxX: number, boxY: number, boxW: number, boxH: number): void {
    const el = this.flowHost?.nativeElement;
    if (!el) return;

    const nodeElements = el.querySelectorAll<HTMLElement>('[data-entity-id]');
    const selected: string[] = [];

    for (let i = 0; i < nodeElements.length; i++) {
      const nodeEl = nodeElements[i];
      const r = nodeEl.getBoundingClientRect();
      const intersects =
        r.left < boxX + boxW &&
        r.right > boxX &&
        r.top < boxY + boxH &&
        r.bottom > boxY;

      if (intersects) {
        const id = nodeEl.getAttribute('data-entity-id');
        if (id) selected.push(id);
      }
    }

    this.selectedEntityIds.set(selected);
    this.selectedEntityId.set(selected.length === 1 ? selected[0] : null);
    this.selection.set(selected);
    this.flow?.select(selected, []);
    this.ws.sendSelection(selected, null);
  }

  onCanvasDoubleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.entity-node') || target.closest('.uml-class-node') || target.closest('button') || target.closest('input')) return;
    const el = this.flowHost?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pan = this.canvasPan();
    const scale = this.canvasScale();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const cx = (vx - pan.x) / scale;
    const cy = (vy - pan.y) / scale;
    let n = 1;
    const names = new Set(this.diagram.entities().map((ent) => ent.name));
    while (names.has(`Tabla${n}`)) n++;
    const name = `Tabla${n}`;
    const base = name.toLowerCase();
    let id = base;
    let c = 2;
    while (this.diagram.getEntity(id)) {
      id = `${base}_${c++}`;
    }
    this.cmd.createEntity(
      id,
      name,
      [{ name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' }],
      { x: cx - 110, y: cy - 30 }
    );
    this.diagram.pendingEditId.set(id);
    setTimeout(() => this.diagram.pendingEditId.set(null), 2000);
  }

  onNodeMoved(event: FMoveNodesEvent): void {
    const otherNodes: NodeRect[] = this.diagram.entities().map((e) => ({
      id: e.id,
      x: e.position.x,
      y: e.position.y,
      w: 220,
      h: 160,
    }));

    for (const node of event.nodes) {
      const snap = this.smartGuides.calculateSnap(node.id, node.position, { w: 220, h: 160 }, otherNodes);
      this.activeGuides.set(snap.guides);

      const existing = this.moveDebounceTimers.get(node.id);
      if (existing) clearTimeout(existing);

      this.moveDebounceTimers.set(
        node.id,
        setTimeout(() => {
          this.cmd.moveEntity(node.id, { x: snap.x, y: snap.y });
          this.moveDebounceTimers.delete(node.id);
          this.activeGuides.set([]);
        }, 40)
      );
    }
  }

  onConnectionCreated(event: any): void {
    const outId: string | undefined = event.fOutputId ?? event.fSourceId ?? event.sourceId;
    const inId: string | undefined = event.fInputId ?? event.fTargetId ?? event.targetId;
    if (!outId || !inId) return;

    const source = this.parseConnectorId(outId);
    const target = this.parseConnectorId(inId);

    if (source.entityId && target.entityId) {
      const relType = this.selection.currentRelationKind() || 'Association';
      const semanticError = this.validateRelationSemantics(source.entityId, target.entityId, relType);
      if (semanticError) {
        this.toast.error(semanticError);
        return;
      }

      if (relType.startsWith('Generalization') || relType.startsWith('Realization')) {
        if (this.wouldCreateGeneralizationCycle(source.entityId, target.entityId)) {
          this.toast.error('Herencia circular no permitida: crearía un ciclo en la jerarquía.');
          return;
        }
      }

      const isAssoc = getRelationCategory(relType) === 'Association';
      const defaultSrc = isAssoc ? '1' : null;
      const defaultTgt = isAssoc ? '1' : null;

      const relId = this.cmd.createRelation(
        source.entityId,
        target.entityId,
        source.columnName,
        target.columnName,
        relType,
        null,
        null,
        null,
        defaultSrc,
        defaultTgt
      );
      this.toast.info(`Relación ${relType} creada`);

      if (isAssoc) {
        this.openMultiplicityConfig(relId);
      }
    }
  }

  onConnectionReassigned(event: any): void {
    const relId: string | undefined = event.connectionId ?? event.fConnectionId;
    if (!relId) return;
    const rel = this.diagram.relations().find((r) => r.id === relId);
    if (!rel) return;

    const nextSourceId: string | undefined = event.nextSourceId ?? event.fNextSourceId ?? event.newSourceId;
    const nextTargetId: string | undefined = event.nextTargetId ?? event.fNextTargetId ?? event.newTargetId;

    let sourceId = rel.sourceId;
    let sourceCol = rel.sourceColumn;
    if (nextSourceId) {
      const parsed = this.parseConnectorId(nextSourceId);
      sourceId = parsed.entityId;
      sourceCol = parsed.columnName;
    }

    let targetId = rel.targetId;
    let targetCol = rel.targetColumn;
    if (nextTargetId) {
      const parsed = this.parseConnectorId(nextTargetId);
      targetId = parsed.entityId;
      targetCol = parsed.columnName;
    }

    this.cmd.createRelation(sourceId, targetId, sourceCol, targetCol, rel.type);
    this.cmd.deleteRelation(relId);
  }

  onSelectionChange(event: FSelectionChangeEvent): void {
    const connIds = (event as any).connectionIds as string[] | undefined;
    if (connIds && connIds.length > 0) {
      this.selectedRelationId.set(connIds[0]);
      this.selectedEntityId.set(null);
      this.selectedEntityIds.set([]);
      this.selection.clear();
      this.ws.sendSelection([], null);
      return;
    }
    const ids = event.nodeIds || [];
    this.selection.set(ids);
    this.selectedEntityIds.set(ids);
    this.selectedEntityId.set(ids.length === 1 ? ids[0] : null);
    this.selectedRelationId.set(null);
    this.ws.sendSelection(ids, null);
  }

  onDeleteSelected(event: FDeleteSelectedEvent): void {
    for (const nodeId of event.nodeIds || []) {
      this.cmd.deleteEntity(nodeId);
    }
    for (const relId of event.connectionIds || []) {
      this.cmd.deleteRelation(relId);
    }
    this.clearSelection();
  }

  onFlowMouseMove(e: MouseEvent): void {
    const now = performance.now();
    if (now - this.lastCursorSend < 50) return;
    this.lastCursorSend = now;

    if (!this.ws.online()) return;
    const el = this.flowHost?.nativeElement;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const pan = this.canvasPan();
    const scale = this.canvasScale();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const cx = (vx - pan.x) / scale;
    const cy = (vy - pan.y) / scale;
    this.ws.sendCursor({ x: cx, y: cy });
  }

  onCanvasChange(event: FCanvasChangeEvent): void {
    this.canvasPan.set(event.position);
    this.canvasScale.set(event.scale);
    this.syncZoom();
  }

  zoomIn(): void {
    this.zoom?.zoomIn();
  }

  zoomOut(): void {
    this.zoom?.zoomOut();
  }

  zoomReset(): void {
    this.zoom?.reset();
    this.syncZoom();
  }

  fitToScreen(): void {
    this.canvas?.fitToScreen(undefined, true, false);
    this.syncZoom();
  }

  private syncZoom(): void {
    const value = this.zoom?.getZoomValue();
    if (typeof value === 'number') {
      this.zoomPercent.set(Math.round(value * 100));
    }
  }

  // ── Helper Connectors & Graph Operations ──────────────────────────────────

  private parseConnectorId(connectorId: string): { entityId: string; columnName: string } {
    const clean = connectorId.split('@')[0];
    const sep = clean.lastIndexOf(':');
    if (sep === -1) {
      return { entityId: clean, columnName: '' };
    }
    return {
      entityId: clean.slice(0, sep),
      columnName: clean.slice(sep + 1),
    };
  }

  private getClassifierType(entity: DBEntity | undefined): string {
    if (!entity) return 'class';
    const st = entity.stereotype?.toLowerCase();
    if (entity.elementType) return entity.elementType.toLowerCase();
    if (st === 'enumeration' || st === 'interface' || st === 'datatype') return st;
    if (entity.isAbstract) return 'abstract_class';
    return 'class';
  }

  private validateRelationSemantics(srcId: string, tgtId: string, relType: string): string | null {
    const src = this.diagram.entities().find((e) => e.id === srcId);
    const tgt = this.diagram.entities().find((e) => e.id === tgtId);
    if (!src || !tgt) return null;

    const srcType = this.getClassifierType(src);
    const tgtType = this.getClassifierType(tgt);
    const kind = (relType || 'Association').toLowerCase();
    const cat = getRelationCategory(relType);

    // 0. Bloqueo de auto-herencia y auto-realización reflexiva
    if (srcId === tgtId && (kind.startsWith('generalization') || kind.startsWith('inheritance') || kind.startsWith('realization') || kind.startsWith('implementation'))) {
      return 'Un clasificador no puede tener relaciones de herencia o realización hacia sí mismo.';
    }

    // 1. Generalización (Herencia)
    if (kind.startsWith('generalization') || kind.startsWith('inheritance')) {
      if (srcType === 'enumeration' || tgtType === 'enumeration') {
        return 'Los Enumeradores (enum) no pueden participar en relaciones de herencia.';
      }
      if (srcType === 'datatype' || tgtType === 'datatype') {
        return 'Los DataTypes (Value Objects) no soportan herencia.';
      }
      if ((srcType === 'class' || srcType === 'abstract_class') && tgtType === 'interface') {
        return 'Una clase no puede heredar de una interfaz. Utiliza una relación de Realización (implements).';
      }
      if (srcType === 'interface' && (tgtType === 'class' || tgtType === 'abstract_class')) {
        return 'Una interfaz no puede heredar de una clase.';
      }

      // Restricción de Herencia Simple entre Clases (Spring Boot / SQL)
      if (srcType === 'class' || srcType === 'abstract_class') {
        const existingParent = this.diagram.relations().find(
          (r) =>
            r.sourceId === srcId &&
            (r.type.toLowerCase().startsWith('generalization') || r.type.toLowerCase().startsWith('inheritance'))
        );
        if (existingParent && existingParent.targetId !== tgtId) {
          const parentEntity = this.diagram.entities().find((e) => e.id === existingParent.targetId);
          return `Herencia múltiple no soportada: la clase ya hereda de '${parentEntity?.name || 'otra clase'}'. Java y dgram solo admiten herencia simple entre clases. Para múltiples contratos, utiliza Realización hacia Interfaces.`;
        }
      }
      return null;
    }

    // 2. Realización (Implementación de interfaz)
    if (kind.startsWith('realization') || kind.startsWith('implementation')) {
      if (tgtType !== 'interface') {
        return 'La Realización solo puede tener como destino una Interfaz.';
      }
      if (srcType === 'interface') {
        return 'Una interfaz no realiza otra interfaz; debe extenderla mediante Generalización.';
      }
      if (srcType === 'enumeration' || srcType === 'datatype') {
        return 'Los enums y datatypes no pueden realizar interfaces.';
      }
      return null;
    }

    // 3. Asociación / Agregación / Composición
    if (cat === 'Association') {
      if (srcType === 'enumeration' || tgtType === 'enumeration') {
        return 'Los enums no se conectan mediante asociaciones de línea; agrégalos como tipo de dato en los atributos de la clase.';
      }
    }

    return null;
  }

  private wouldCreateGeneralizationCycle(childId: string, parentId: string, excludeRelId?: string): boolean {
    if (childId === parentId) return true;

    const visited = new Set<string>();
    const queue = [parentId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === childId) return true;
      visited.add(curr);

      const parentRelations = this.diagram.relations().filter(
        (r) =>
          r.id !== excludeRelId &&
          r.sourceId === curr &&
          (r.type.startsWith('Generalization') || r.type.startsWith('Realization'))
      );

      for (const pr of parentRelations) {
        if (!visited.has(pr.targetId)) {
          queue.push(pr.targetId);
        }
      }
    }

    return false;
  }

  private getParallelRelationIndex(rel: DBRelation): number {
    const pair = [rel.sourceId, rel.targetId].sort().join('::');
    const parallel = this.validRelations().filter((r) => {
      return [r.sourceId, r.targetId].sort().join('::') === pair;
    });
    return parallel.findIndex((r) => r.id === rel.id);
  }

  resolveSourceConnector(rel: DBRelation): string {
    // Self-loop: exit from right side
    if (rel.sourceId === rel.targetId) {
      return `${rel.sourceId}@class-out`;
    }

    // 1. Distributed non-clumping connector slot (UML Classifier-to-Classifier)
    const slotConnector = this.edgeSlotMap().get(rel.id)?.sourceConnector;
    if (slotConnector) return slotConnector;

    // 2. Explicit Column-level FK connector fallback
    if (rel.sourceColumn) {
      const entity = this.diagram.getEntity(rel.sourceId);
      if (entity?.attributes.some((a) => a.name === rel.sourceColumn)) {
        return `${rel.sourceId}:${rel.sourceColumn}@out`;
      }
    }

    // 3. Fallback: side computed by the edge router
    const routed = this.edgeRouteMap().get(rel.id);
    const side = routed?.sourceSide ?? 'right';
    return this.connectorIdForSide(rel.sourceId, side);
  }

  resolveTargetConnector(rel: DBRelation): string {
    // Self-loop: enter from top side
    if (rel.sourceId === rel.targetId) {
      return `${rel.targetId}@class-top`;
    }

    // 1. Distributed non-clumping connector slot (UML Classifier-to-Classifier)
    const slotConnector = this.edgeSlotMap().get(rel.id)?.targetConnector;
    if (slotConnector) return slotConnector;

    // 2. Explicit Column-level FK connector fallback
    if (rel.targetColumn) {
      const entity = this.diagram.getEntity(rel.targetId);
      if (entity?.attributes.some((a) => a.name === rel.targetColumn)) {
        return `${rel.targetId}:${rel.targetColumn}@in`;
      }
    }

    // 3. Fallback: side computed by the edge router
    const routed = this.edgeRouteMap().get(rel.id);
    const side = routed?.targetSide ?? 'left';
    return this.connectorIdForSide(rel.targetId, side, true);
  }

  /** Maps a cardinal connector side to the Foblex connector ID for the entity */
  private connectorIdForSide(entityId: string, side: ConnectorSide, isInput = false): string {
    switch (side) {
      case 'top':    return `${entityId}@class-top`;
      case 'bottom': return `${entityId}@class-bottom`;
      case 'right':  return `${entityId}@class-out`;
      case 'left':   return `${entityId}@class-in`;
      default:       return isInput ? `${entityId}@class-in` : `${entityId}@class-out`;
    }
  }

  /** Returns pre-computed Manhattan waypoints for a relation (empty array = straight Foblex segment) */
  getEdgeWaypoints(rel: DBRelation): IPoint[] {
    return this.edgeRouteMap().get(rel.id)?.waypoints ?? [];
  }

  /** All connections use orthogonal segment routing; when pre-computed Manhattan waypoints exist, use straight interpolation to avoid Foblex waypoint re-routing loops */
  getConnectionType(rel: DBRelation): 'segment' | 'bezier' | 'straight' | 'adaptive-curve' {
    if (this.getEdgeWaypoints(rel).length > 0) {
      return 'straight';
    }
    return 'segment';
  }

  /** Port clearance offset: generous clearance for self-loops to loop cleanly around node corners */
  getConnectionOffset(rel: DBRelation): number {
    if (rel.sourceId === rel.targetId) {
      return 28 + this.getParallelRelationIndex(rel) * 16;
    }
    return 16;
  }



  entityName(id: string): string {
    return this.diagram.getEntity(id)?.name ?? id;
  }

  getRemotePeerForEntity(entityId: string): Peer | null {
    const selections = this.ws.remoteSelections();
    for (const [userId, ids] of Object.entries(selections)) {
      if (ids && ids.includes(entityId)) {
        return (
          this.ws.peers().find((p) => p.user_id === userId) || {
            user_id: userId,
            name: `User-${userId.slice(0, 4)}`,
            color: '#3b82f6',
          }
        );
      }
    }
    return null;
  }

  getRemoteEditingPeer(entityId: string): Peer | null {
    const editing = this.ws.remoteEditing();
    for (const [userId, id] of Object.entries(editing)) {
      if (id === entityId) {
        return (
          this.ws.peers().find((p) => p.user_id === userId) || {
            user_id: userId,
            name: `User-${userId.slice(0, 4)}`,
            color: '#f59e0b',
          }
        );
      }
    }
    return null;
  }

  cursorPosition(cur: RemoteCursor): { left: number; top: number } {
    const pan = this.canvasPan();
    const scale = this.canvasScale();
    return {
      left: pan.x + cur.position.x * scale,
      top: pan.y + cur.position.y * scale,
    };
  }

  private clearSelection(): void {
    this.selectedEntityId.set(null);
    this.selection.clear();
  }


  createEntityAtCenter(): void {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `entity-${Date.now()}`;
    const name = `Clase${this.diagram.entityCount() + 1}`;
    const x = Math.max(100, Math.round(-this.canvasPan().x + 300));
    const y = Math.max(100, Math.round(-this.canvasPan().y + 200));
    this.cmd.createEntity(
      id,
      name,
      [{ name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' }],
      { x, y }
    );
    this.selection.set([id]);
    this.toast.success(`Clase ${name} creada`);
  }

  onProactiveAction(actionType?: string): void {
    if (actionType === 'create_class') {
      this.createEntityAtCenter();
    } else if (actionType === 'open_chat') {
      this.openChat.emit();
    }
    this.proactivity.dismissHint();
  }

  getPackageName(packageId?: string | null): string | null {
    if (!packageId) return null;
    const pkg = this.diagram.packages().find((p) => p.id === packageId);
    return pkg ? pkg.name : null;
  }

  handleNodeEditStarted(entityId: string): void {
    this.ws.sendSelection([entityId], entityId);
  }

  handleNodeEditEnded(entityId: string): void {
    this.ws.sendSelection([entityId], null);
  }

  handleNodeRenamed(e: { id: string; name: string }): void {
    this.cmd.updateEntity(e.id, e.name);
  }

  handleNodeAttrUpdated(e: { entityId: string; origName: string; changes: { name?: string; type?: string } }): void {
    this.cmd.updateColumn(e.entityId, e.origName, e.changes);
  }

  handleNodeAttrAdded(e: { entityId: string; attr: Partial<DBAttribute> }): void {
    this.cmd.addColumn(e.entityId, e.attr as any);
  }

  handleNodeResized(e: { id: string; width: number; height: number }): void {
    this.cmd.resizeEntity(e.id, e.width, e.height);
  }
}

