import {
  Component,
  inject,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  HostListener,
  effect,
  computed,
  input,
  output,
  afterRender,
  NgZone,
  ChangeDetectionStrategy,
} from '@angular/core';
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
import { SmartGuidesService, GuideLine, NodeRect } from '../../services/smart-guides.service';
import { LayoutService } from '../../services/layout.service';
import { ProactivityService } from '../../../ai/services/proactivity.service';
import { CanvasShortcutsService } from '../../services/canvas-shortcuts.service';
import { CanvasValidationService } from '../../services/canvas-validation.service';
import { CanvasEdgeService } from '../../services/canvas-edge.service';
import { CanvasViewportService } from '../../services/canvas-viewport.service';
import { CanvasRelationService } from '../../services/canvas-relation.service';
import { TableNodeComponent } from './table-node/table-node.component';
import { DBRelation, ClassifierType, DBAttribute } from '../../models/diagram.model';
import { QuickLinkerComponent, QuickLinkerPosition } from './quick-linker/quick-linker.component';
import { CanvasContextMenuComponent, CanvasContextMenuState } from './context-menu/canvas-context-menu.component';
import { AlignmentToolbarComponent } from './alignment-toolbar/alignment-toolbar.component';
import { RelationCardinalityPipe, MultiplicityMeaningPipe } from '../../pipes/relation-cardinality.pipe';
import { IsDashedRelationPipe, RelationCategoryPipe, getRelationCategory } from '../../pipes/relation-symbol.pipe';

interface FConnectionCreateEvent {
  fOutputId?: string;
  fSourceId?: string;
  sourceId?: string;
  fInputId?: string;
  fTargetId?: string;
  targetId?: string;
}

interface FConnectionReassignEvent {
  connectionId?: string;
  fConnectionId?: string;
  nextSourceId?: string;
  fNextSourceId?: string;
  newSourceId?: string;
  nextTargetId?: string;
  fNextTargetId?: string;
  newTargetId?: string;
}

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
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

  validation = inject(CanvasValidationService);
  edge = inject(CanvasEdgeService);
  viewport = inject(CanvasViewportService);
  relation = inject(CanvasRelationService);
  private ngZone = inject(NgZone);

  private readonly onWindowMouseMove = (e: MouseEvent) => this.handleWindowMouseMove(e);
  private readonly onWindowMouseUp = () => this.handleWindowMouseUp();
  private readonly onFlowMouseMove = (e: MouseEvent) => this.handleFlowMouseMove(e);

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
  hoveredEntityId = signal<string | null>(null);
  highlightedEntityId = signal<string | null>(null);
  activeGuides = signal<GuideLine[]>([]);

  quickLinkerSourceId = signal<string | null>(null);
  showQuickLinkerMenu = signal<QuickLinkerPosition | null>(null);
  contextMenu = signal<CanvasContextMenuState | null>(null);

  private rightClickStart: { x: number; y: number } | null = null;
  private isRightDragging = false;
  private pendingContextMenu: CanvasContextMenuState | null = null;
  private panStart = { x: 0, y: 0 };
  private panOrigin = { x: 0, y: 0 };
  private lastCursorSend = 0;

  // --- Delegated Signals from Services ---
  readonly selectedRelationId = this.relation.selectedRelationId;
  readonly hoveredRelationId = this.relation.hoveredRelationId;
  readonly selectedRelation = this.relation.selectedRelation;
  readonly activeMultiplicityRelId = this.relation.activeMultiplicityRelId;
  readonly activeMultiplicityRel = this.relation.activeMultiplicityRel;

  readonly visibleEntities = this.edge.visibleEntities;
  readonly validRelations = this.edge.validRelations;
  readonly edgeRouteMap = this.edge.edgeRouteMap;
  readonly edgeSlotMap = this.edge.edgeSlotMap;

  readonly zoomPercent = this.viewport.zoomPercent;
  readonly canvasPan = this.viewport.canvasPan;
  readonly canvasScale = this.viewport.canvasScale;
  readonly isPanning = this.viewport.isPanning;
  readonly rightClickBox = this.viewport.rightClickBox;
  readonly lineType = this.viewport.lineType;
  readonly gridType = this.viewport.gridType;
  readonly showMinimap = this.viewport.showMinimap;

  readonly remoteCursors = computed(() => Object.values(this.ws.cursors()));

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
        selected_element_type: sel ? 'class' : this.selectedRelationId() ? 'relation' : null,
        active_tool: this.selection.activeTool(),
        viewport: { x: this.canvasPan().x, y: this.canvasPan().y, zoom: this.canvasScale() },
      });
    }
  });

  constructor() {
    afterRender(() => this.edge.refreshAssocMidpoints());
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.diagram.entityCount() > 2) this.fitToScreen();
      this.proactivity.checkEmptyBoard(this.diagram.entityCount());
    }, 500);

    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('mousemove', this.onWindowMouseMove, { passive: true });
      window.addEventListener('mouseup', this.onWindowMouseUp);
      const el = this.flowHost?.nativeElement;
      if (el) {
        el.addEventListener('mousemove', this.onFlowMouseMove, { passive: true });
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    const el = this.flowHost?.nativeElement;
    if (el) {
      el.removeEventListener('mousemove', this.onFlowMouseMove);
    }
  }

  // --- Keyboard & Window Listeners ---
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

  private handleWindowMouseMove(e: MouseEvent): void {
    if (!this.isPanning() && !this.rightClickStart) {
      return;
    }

    if (this.isPanning() && this.canvas) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      const nextPan = { x: this.panOrigin.x + dx, y: this.panOrigin.y + dy };
      (this.canvas as any)._setPosition?.(nextPan);
      this.canvas.redraw();
      (this.canvas as any).emitCanvasChangeEvent?.();
      this.ngZone.run(() => {
        this.canvasPan.set(nextPan);
      });
    }

    if (this.rightClickStart) {
      const dx = e.clientX - this.rightClickStart.x;
      const dy = e.clientY - this.rightClickStart.y;
      if (!this.isRightDragging && Math.hypot(dx, dy) > 4) {
        this.isRightDragging = true;
        this.pendingContextMenu = null;
        this.ngZone.run(() => {
          this.contextMenu.set(null);
        });
      }
      if (this.isRightDragging) {
        const x = Math.min(this.rightClickStart.x, e.clientX);
        const y = Math.min(this.rightClickStart.y, e.clientY);
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        this.ngZone.run(() => {
          this.rightClickBox.set({ x, y, w, h });
          this.updateMarqueeSelection(x, y, w, h);
        });
      }
    }
  }

  private handleWindowMouseUp(): void {
    if (this.isPanning() || this.rightClickStart || this.isRightDragging || this.pendingContextMenu) {
      this.ngZone.run(() => {
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
      });
    }
  }

  // --- Entity Selection & Direct Manipulation ---
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
        const semanticError = this.validation.validateRelationSemantics(srcId, id, relType);
        if (semanticError) {
          this.toast.error(semanticError);
          this.selection.setTool('select');
          this.selection.pendingSourceId.set(null);
          return;
        }

        if (relType.startsWith('Generalization') || relType.startsWith('Realization')) {
          if (this.validation.wouldCreateGeneralizationCycle(srcId, id)) {
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
      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : this.nextUniqueEntityId(src.name);
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

  // --- Relation and Multiplicity Delegation ---
  cycleRelationType(): void {
    this.relation.cycleRelationType();
  }

  openMultiplicityConfig(relId: string): void {
    this.relation.openMultiplicityConfig(relId);
    this.selectedEntityId.set(null);
    this.relationSelected.emit(relId);
  }

  closeMultiplicityConfig(): void {
    this.relation.closeMultiplicityConfig();
  }

  setMultiplicities(relId: string, src: string, tgt: string): void {
    this.relation.setMultiplicities(relId, src, tgt);
  }

  updateRelSourceMultiplicity(relId: string, src: string): void {
    this.relation.updateRelSourceMultiplicity(relId, src);
  }

  updateRelTargetMultiplicity(relId: string, tgt: string): void {
    this.relation.updateRelTargetMultiplicity(relId, tgt);
  }

  onCardinalityClick(relId: string): void {
    this.openMultiplicityConfig(relId);
  }

  // --- Context Menu & Quick Linker ---
  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: MouseEvent, entityId?: string): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.isRightDragging) return;
    this.pendingContextMenu = {
      x: e.clientX,
      y: e.clientY,
      entityId,
    };
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

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

    const baseName =
      classifierType === 'interface'
        ? 'IInterface'
        : classifierType === 'enumeration'
        ? 'EnumKind'
        : 'NewClass';
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

    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `entity-${Date.now()}`;
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

  // --- Alignment & Layout ---
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

  // --- Mouse & Canvas Events ---
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
      e.preventDefault();
      e.stopPropagation();
      const rawDelta = e.deltaY || e.deltaX;
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 40 : 0.5;
      const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta * factor), 50);
      this.panBy(-delta, 0);
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const rawDelta = e.deltaY;
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 40 : 0.5;
      const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta * factor), 50);
      this.panBy(0, -delta);
    }
  }

  panBy(dx: number, dy: number): void {
    this.viewport.panBy(dx, dy, this.canvas);
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
    if (
      target.closest('.entity-node') ||
      target.closest('.uml-class-node') ||
      target.closest('button') ||
      target.closest('input')
    )
      return;
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

  // --- Foblex Event Handlers ---
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

  onConnectionCreated(event: FConnectionCreateEvent): void {
    const outId = event.fOutputId ?? event.fSourceId ?? event.sourceId;
    const inId = event.fInputId ?? event.fTargetId ?? event.targetId;
    if (!outId || !inId) return;

    const source = this.parseConnectorId(outId);
    const target = this.parseConnectorId(inId);

    if (source.entityId && target.entityId) {
      const relType = this.selection.currentRelationKind() || 'Association';
      const semanticError = this.validation.validateRelationSemantics(source.entityId, target.entityId, relType);
      if (semanticError) {
        this.toast.error(semanticError);
        return;
      }

      if (relType.startsWith('Generalization') || relType.startsWith('Realization')) {
        if (this.validation.wouldCreateGeneralizationCycle(source.entityId, target.entityId)) {
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

  onConnectionReassigned(event: FConnectionReassignEvent): void {
    const relId = event.connectionId ?? event.fConnectionId;
    if (!relId) return;
    const rel = this.diagram.relations().find((r) => r.id === relId);
    if (!rel) return;

    const nextSourceId = event.nextSourceId ?? event.fNextSourceId ?? event.newSourceId;
    const nextTargetId = event.nextTargetId ?? event.fNextTargetId ?? event.newTargetId;

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

    this.cmd.updateRelation(relId, {
      sourceId,
      targetId,
      sourceColumn: sourceCol,
      targetColumn: targetCol,
    });
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

  private handleFlowMouseMove(e: MouseEvent): void {
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
    this.ws.sendCursorThrottled({ x: cx, y: cy });
  }

  onCanvasChange(event: FCanvasChangeEvent): void {
    this.canvasPan.set(event.position);
    this.canvasScale.set(event.scale);
    this.viewport.syncZoom(this.zoom);
  }

  // --- Viewport Zoom Actions ---
  zoomIn(): void {
    this.viewport.zoomIn(this.zoom);
  }

  zoomOut(): void {
    this.viewport.zoomOut(this.zoom);
  }

  zoomReset(): void {
    this.viewport.zoomReset(this.zoom);
  }

  fitToScreen(): void {
    this.viewport.fitToScreen(this.canvas, this.zoom);
  }

  // --- Connector & Routing Delegation ---
  resolveSourceConnector(rel: DBRelation): string {
    return this.edge.resolveSourceConnector(rel);
  }

  resolveTargetConnector(rel: DBRelation): string {
    return this.edge.resolveTargetConnector(rel);
  }

  getRelationMidpoint(rel: DBRelation): { x: number; y: number } {
    return this.edge.getRelationMidpoint(rel);
  }

  getAssocClassInputConnector(rel: DBRelation): string {
    return this.edge.getAssocClassInputConnector(rel);
  }

  getEdgeWaypoints(rel: DBRelation): IPoint[] {
    return this.edge.getEdgeWaypoints(rel);
  }

  getConnectionType(rel: DBRelation): 'segment' | 'bezier' | 'straight' | 'adaptive-curve' {
    return this.edge.getConnectionType(rel);
  }

  getConnectionOffset(rel: DBRelation): number {
    return this.edge.getConnectionOffset(rel);
  }

  private parseConnectorId(connectorId: string): { entityId: string; columnName: string } {
    const clean = connectorId.split('@')[0];
    const sep = clean.lastIndexOf(':');
    if (sep === -1) {
      return { entityId: clean, columnName: '' };
    }
    return {
      entityId: clean.substring(0, sep),
      columnName: clean.substring(sep + 1),
    };
  }

  // --- Peer Awareness & Entity Helpers ---
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
