import { Component, inject, AfterViewInit, ViewChild, ElementRef, signal, HostListener, effect, computed, input, output } from '@angular/core';
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
import { DiagramService } from '../../services/diagram.service';
import { CommandService } from '../../services/command.service';
import { SelectionService } from '../../services/selection.service';
import { WebsocketService, RemoteCursor, Peer } from '../../services/websocket.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastService } from '../../../../core/services/toast.service';
import { TableNodeComponent } from './table-node/table-node.component';
import { DBRelation, ClassifierType, DBAttribute } from '../../models/diagram.model';
import { SmartGuidesService, GuideLine, NodeRect } from '../../services/smart-guides.service';
import { LayoutService } from '../../services/layout.service';
import { ProactivityService } from '../../../ai/services/proactivity.service';
import { CanvasShortcutsService } from '../../services/canvas-shortcuts.service';
import { QuickLinkerComponent, QuickLinkerPosition } from './quick-linker/quick-linker.component';
import { CanvasContextMenuComponent, CanvasContextMenuState } from './context-menu/canvas-context-menu.component';
import { AlignmentToolbarComponent } from './alignment-toolbar/alignment-toolbar.component';
import { RelationCardinalityPipe } from '../../pipes/relation-cardinality.pipe';
import { RelationSymbolPipe, IsDashedRelationPipe, RelationCategoryPipe } from '../../pipes/relation-symbol.pipe';

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
    RelationSymbolPipe,
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
  showMinimap = signal(false);
  contextMenu = signal<CanvasContextMenuState | null>(null);

  isPanning = signal(false);
  private panStart = { x: 0, y: 0 };
  private panOrigin = { x: 0, y: 0 };
  private lastCursorSend = 0;

  readonly remoteCursors = computed(() => Object.values(this.ws.cursors()));
  readonly selectedRelation = computed(() => {
    const id = this.selectedRelationId();
    return id ? this.diagram.relations().find((r) => r.id === id) ?? null : null;
  });

  readonly validRelations = computed(() => {
    const entityMap = new Map(this.diagram.entities().map((e) => [e.id, e]));
    return this.diagram.relations().filter((r) => entityMap.has(r.sourceId) && entityMap.has(r.targetId));
  });

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
      if (typeof (this.canvas as any)?._setPosition === 'function') {
        (this.canvas as any)._setPosition(nextPan);
      }
      this.canvasPan.set(nextPan);
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    this.isPanning.set(false);
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
      } else if (srcId !== id) {
        const relType = this.selection.currentRelationKind() || 'Association';
        this.cmd.createRelation(srcId, id, '', '', relType);
        this.selection.setTool('select');
        this.selectedEntityId.set(null);
        this.selectedEntityIds.set([]);
        this.ws.sendSelection([], null);
        this.toast.info(`Relación ${relType} creada`);
      } else {
        this.selection.setTool('select');
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
      const newId = this.nextUniqueEntityId(src.name);
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

  cycleRelationType(): void {
    const rel = this.selectedRelation();
    if (!rel) return;
    const order = ['1:1', '1:N', 'N:M', '1:0..1', 'Generalization'];
    const idx = order.indexOf(rel.type);
    const next = order[(idx + 1) % order.length];
    this.cmd.updateRelation(rel.id, { type: next });
  }

  onCardinalityClick(relId: string): void {
    const rel = this.diagram.relations().find((r) => r.id === relId);
    if (!rel) return;
    this.selectedRelationId.set(relId);
    this.selectedEntityId.set(null);
    this.selection.clear();
    const order = ['1:1', '1:N', 'N:M', '1:0..1', 'Generalization'];
    const idx = order.indexOf(rel.type);
    const next = order[(idx + 1) % order.length];
    this.cmd.updateRelation(relId, { type: next });
  }

  // ── Context Menu Operations ───────────────────────────────────────────────

  onContextMenu(e: MouseEvent, entityId?: string): void {
    e.preventDefault();
    this.contextMenu.set({
      x: e.clientX,
      y: e.clientY,
      entityId,
    });
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

    const newId = `entity-${Date.now()}`;
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

  // ── Canvas Interaction, Pan & Zoom ────────────────────────────────────────

  onCanvasMouseDown(e: MouseEvent): void {
    if (this.shortcuts.isSpacePressed() || this.selection.activeTool() === 'hand' || e.button === 1) {
      e.preventDefault();
      this.isPanning.set(true);
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panOrigin = { ...this.canvasPan() };
    }
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
      if (relType.startsWith('Generalization') || relType.startsWith('Realization')) {
        if (this.wouldCreateGeneralizationCycle(source.entityId, target.entityId)) {
          this.toast.error('Herencia circular no permitida: crearía un ciclo en la jerarquía.');
          return;
        }
      }
      this.cmd.createRelation(source.entityId, target.entityId, source.columnName, target.columnName, relType);
      this.toast.info(`Relación ${relType} creada`);
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
    if (rel.sourceId === rel.targetId) {
      if (rel.sourceColumn) {
        const entity = this.diagram.getEntity(rel.sourceId);
        if (entity?.attributes.some((a) => a.name === rel.sourceColumn)) {
          return `${rel.sourceId}:${rel.sourceColumn}@out`;
        }
      }
      return `${rel.sourceId}@class-top`;
    }

    if (rel.sourceColumn) {
      const entity = this.diagram.getEntity(rel.sourceId);
      if (entity?.attributes.some((a) => a.name === rel.sourceColumn)) {
        return `${rel.sourceId}:${rel.sourceColumn}@out`;
      }
    }

    const parallelIdx = this.getParallelRelationIndex(rel);
    if (parallelIdx === 1) {
      return `${rel.sourceId}@class-top`;
    } else if (parallelIdx >= 2) {
      return `${rel.sourceId}@class-bottom`;
    }

    return `${rel.sourceId}@class-out`;
  }

  resolveTargetConnector(rel: DBRelation): string {
    if (rel.sourceId === rel.targetId) {
      if (rel.targetColumn) {
        const entity = this.diagram.getEntity(rel.targetId);
        if (entity?.attributes.some((a) => a.name === rel.targetColumn)) {
          return `${rel.targetId}:${rel.targetColumn}@in`;
        }
      }
      return `${rel.targetId}@class-out`;
    }

    if (rel.targetColumn) {
      const entity = this.diagram.getEntity(rel.targetId);
      if (entity?.attributes.some((a) => a.name === rel.targetColumn)) {
        return `${rel.targetId}:${rel.targetColumn}@in`;
      }
    }

    const parallelIdx = this.getParallelRelationIndex(rel);
    if (parallelIdx === 1) {
      return `${rel.targetId}@class-top`;
    } else if (parallelIdx >= 2) {
      return `${rel.targetId}@class-bottom`;
    }

    return `${rel.targetId}@class-in`;
  }

  getConnectionType(rel: DBRelation): 'segment' | 'bezier' | 'straight' | 'adaptive-curve' {
    if (rel.sourceId === rel.targetId) return 'bezier';
    const parallelIdx = this.getParallelRelationIndex(rel);
    if (parallelIdx > 0) return 'bezier';
    return this.lineType();
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
    const id = `entity-${Date.now()}`;
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

