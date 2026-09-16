import { Component, inject, OnInit, AfterViewInit, ViewChild, ElementRef, signal, HostListener, effect, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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
import { PersistenceService } from '../../services/persistence.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastService } from '../../../../core/services/toast.service';
import { TableNodeComponent } from './table-node/table-node.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { ToastContainerComponent } from '../../../../core/components/toast-container/toast-container.component';
import { CodegenModalComponent } from '../../../../generation/code/components/codegen-modal/codegen-modal.component';
import { MembersModalComponent } from '../../../../workspace/projects/components/members-modal/members-modal.component';
import { ExportService } from '../../../../generation/schema/services/export.service';
import { DBRelation, ClassifierType } from '../../models/diagram.model';
import { BoardService, ProjectClass } from '../../services/board.service';
import { SmartGuidesService, GuideLine, NodeRect } from '../../services/smart-guides.service';
import { LayoutService } from '../../services/layout.service';
import { AgentGuideComponent } from '../../../ai/components/agent-guide/agent-guide.component';
import { ProactivityService } from '../../../ai/services/proactivity.service';
import { CanvasShortcutsService } from '../../services/canvas-shortcuts.service';
import { ExplorerSidebarComponent } from './explorer-sidebar/explorer-sidebar.component';
import { QuickLinkerComponent, QuickLinkerPosition } from './quick-linker/quick-linker.component';
import { CanvasContextMenuComponent, CanvasContextMenuState } from './context-menu/canvas-context-menu.component';
import { AlignmentToolbarComponent } from './alignment-toolbar/alignment-toolbar.component';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FFlowModule,
    TableNodeComponent,
    ToolbarComponent,
    SidebarComponent,
    CommandPaletteComponent,
    ToastContainerComponent,
    CodegenModalComponent,
    MembersModalComponent,
    AgentGuideComponent,
    ExplorerSidebarComponent,
    QuickLinkerComponent,
    CanvasContextMenuComponent,
    AlignmentToolbarComponent,
  ],
  providers: [provideFFlow(withA11y())],
  templateUrl: './canvas.component.html',
})
export class CanvasComponent implements OnInit, AfterViewInit {
  @ViewChild(FFlowComponent, { read: ElementRef }) flowHost?: ElementRef<HTMLElement>;
  @ViewChild(FFlowComponent) flow!: FFlowComponent;
  @ViewChild(FCanvasComponent) canvas?: FCanvasComponent;
  @ViewChild(FZoomDirective) zoom?: FZoomDirective;
  @ViewChild(ToolbarComponent) toolbar?: ToolbarComponent;

  diagram = inject(DiagramService);
  cmd = inject(CommandService);
  selection = inject(SelectionService);
  ws = inject(WebsocketService);
  auth = inject(AuthService);
  theme = inject(ThemeService);
  toast = inject(ToastService);
  exportSvc = inject(ExportService);
  smartGuides = inject(SmartGuidesService);
  layoutSvc = inject(LayoutService);
  boardSvc = inject(BoardService);
  proactivity = inject(ProactivityService);
  shortcuts = inject(CanvasShortcutsService);
  private persistence = inject(PersistenceService);
  private route = inject(ActivatedRoute);

  private moveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  boardId = signal<string>('default-board');
  selectedEntityId = signal<string | null>(null);
  selectedEntityIds = signal<string[]>([]);
  selectedRelationId = signal<string | null>(null);
  hoveredEntityId = signal<string | null>(null);
  hoveredRelationId = signal<string | null>(null);
  highlightedEntityId = signal<string | null>(null);
  activeGuides = signal<GuideLine[]>([]);

  quickLinkerSourceId = signal<string | null>(null);
  showQuickLinkerMenu = signal<QuickLinkerPosition | null>(null);
  isSidebarOpen = signal(true);
  zoomPercent = signal(100);
  canvasPan = signal({ x: 0, y: 0 });
  canvasScale = signal(1);
  lineType = signal<'segment' | 'bezier' | 'straight' | 'adaptive-curve'>('segment');
  gridType = signal<'dots' | 'lines' | 'none'>('dots');
  showMinimap = signal(false);
  showCommandPalette = signal(false);
  showCodegenModal = signal(false);
  showMembersModal = signal(false);
  contextMenu = signal<CanvasContextMenuState | null>(null);
  expandedEntityIds = signal<Set<string>>(new Set());
  isLoadingCatalog = signal(false);
  projectCatalogClasses = signal<ProjectClass[]>([]);

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

  ngOnInit(): void {
    const boardId = this.route.snapshot.paramMap.get('id') || 'default-board';
    this.boardId.set(boardId);

    this.persistence.load(boardId);
    this.persistence.activateSave(boardId);

    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;
    const token = this.auth.token() || undefined;
    this.ws.connect(boardId, userId, token);

    this.ws.onMessage((msg) => {
      if (msg.type === 'command:executed') {
        this.cmd.ingestRemote(msg.data);
      } else if (msg.type === 'agent:ui_action') {
        const action = msg.data;
        if (action?.action_type === 'highlight' || action?.action_type === 'focus') {
          if (action.target_id) {
            const target = action.target_id.toLowerCase();
            const entity = this.diagram.entities().find(
              (e) => e.id === action.target_id || (e.name && e.name.toLowerCase() === target)
            );
            if (entity) {
              this.selectedEntityId.set(entity.id);
              this.highlightedEntityId.set(entity.id);
              setTimeout(() => this.highlightedEntityId.set(null), 3500);
            }
          }
          if (action.message) {
            this.toast.show(action.message, 'info');
          }
        } else if (action?.action_type === 'open_panel') {
          if (action.tab === 'codegen') this.showCodegenModal.set(true);
          if (action.tab === 'members') this.showMembersModal.set(true);
        }
      } else if (msg.type === 'agent:commands_executed') {
        const data = msg.data;
        const count = data?.commands?.length || 0;
        if (count > 0) {
          this.toast.show(`${data.agent || 'Agente'} aplicó ${count} cambio(s) en el diagrama.`, 'success');
        }
      }
    });

    this.seedDemoData();
    this.loadProjectCatalog();
  }

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
      onToggleSidebar: () => this.toggleSidebar(),
      onToggleCommandPalette: () => this.showCommandPalette.update((v) => !v),
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

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.shouldWarnGuestLeave()) {
      e.preventDefault();
      e.returnValue = 'Estás en modo invitado. Si recargas o sales de la página perderás la información añadida.';
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

  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  toggleExpandEntity(id: string): void {
    const current = new Set(this.expandedEntityIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.expandedEntityIds.set(current);
  }

  toggleAllEntitiesExpand(): void {
    const all = this.diagram.entities();
    if (this.expandedEntityIds().size >= all.length && all.length > 0) {
      this.expandedEntityIds.set(new Set());
    } else {
      this.expandedEntityIds.set(new Set(all.map((e) => e.id)));
    }
  }

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
  }

  onSelectAssociation(id: string): void {
    if (this.selectedRelationId() === id) {
      this.closeRelationPanel();
      return;
    }
    this.selectedRelationId.set(id);
    this.selectedEntityId.set(null);
    this.selection.clear();
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

  // ── Project Class Catalog (Enterprise Architect Reusability) ──────────────

  loadProjectCatalog(): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.isLoadingCatalog.set(true);
    this.boardSvc.getProjectClasses(bId).subscribe({
      next: (classes) => {
        this.projectCatalogClasses.set(classes);
        this.isLoadingCatalog.set(false);
      },
      error: () => {
        this.isLoadingCatalog.set(false);
      },
    });
  }

  attachProjectClass(cls: ProjectClass): void {
    const bId = this.boardId();
    const existing = this.diagram.entities().find((e) => e.id === cls.id || e.name === cls.name);
    if (existing) {
      this.toast.info(`La clase "${cls.name}" ya está presente en este tablero`);
      this.jumpToEntity(existing.id);
      return;
    }

    const posX = 120 + (this.diagram.entityCount() % 4) * 35;
    const posY = 120 + (this.diagram.entityCount() % 4) * 35;

    const mappedAttrs = (cls.attributes || []).map((a) => ({
      name: a.name,
      type: a.data_type || 'String',
      pk: a.is_pkey ?? false,
      fk: false,
      nullable: false,
      references: null,
      visibility: a.visibility || '+',
    }));

    if (bId && bId !== 'default-board') {
      this.boardSvc.attachClass(bId, cls.id, { x: posX, y: posY }).subscribe({
        next: () => {
          this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
          this.toast.success(`Clase "${cls.name}" vinculada al tablero`);
          this.loadProjectCatalog();
        },
        error: () => {
          this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
          this.toast.info(`Clase "${cls.name}" agregada`);
        },
      });
    } else {
      this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
      this.toast.success(`Clase "${cls.name}" agregada`);
    }
  }

  detachEntityFromBoard(entityId: string): void {
    const ent = this.diagram.getEntity(entityId);
    const name = ent?.name || entityId;
    this.cmd.deleteEntity(entityId);
    this.clearSelection();
    this.closeContextMenu();

    const bId = this.boardId();
    if (bId && bId !== 'default-board') {
      this.boardSvc.detachClass(bId, entityId).subscribe({
        next: () => {
          this.toast.info(`"${name}" quitada del tablero (disponible en el catálogo)`);
          this.loadProjectCatalog();
        },
        error: () => {
          this.loadProjectCatalog();
        },
      });
    } else {
      this.toast.info(`"${name}" quitada del tablero`);
    }
  }

  deleteEntityFromProjectModel(entityId: string): void {
    const ent = this.diagram.getEntity(entityId);
    const name = ent?.name || entityId;
    if (
      !confirm(
        `¿Eliminar definitivamente la clase "${name}" del modelo del proyecto?\n\nEsta acción eliminará la clase de TODOS los tableros y paquetes del proyecto.`
      )
    ) {
      return;
    }
    this.cmd.deleteEntity(entityId);
    this.clearSelection();
    this.closeContextMenu();

    const bId = this.boardId();
    if (bId && bId !== 'default-board') {
      this.boardSvc.deleteClassFromModel(bId, entityId).subscribe({
        next: () => {
          this.toast.success(`Clase "${name}" eliminada del modelo del proyecto`);
          this.loadProjectCatalog();
        },
        error: () => {
          this.toast.error(`Error al eliminar "${name}" del modelo`);
          this.loadProjectCatalog();
        },
      });
    } else {
      this.toast.success(`Clase "${name}" eliminada`);
    }
  }

  onXmiFileSelected(file: File): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') {
      this.toast.error('Abre o crea un tablero para importar el modelo XMI');
      return;
    }

    this.boardSvc.importXmi(bId, file).subscribe({
      next: (res) => {
        this.toast.success(res.message || 'Modelo XMI importado correctamente');
        this.persistence.load(bId);
        this.loadProjectCatalog();
      },
      error: () => {
        this.toast.error('Error al importar archivo XMI de Enterprise Architect');
      },
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  exportSQL(): void {
    this.exportSvc.downloadSql();
    this.toast.success('Script SQL descargado');
  }

  exportJSON(): void {
    this.exportSvc.downloadJson();
    this.toast.success('Esquema JSON descargado');
  }

  exportXMI(): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') {
      this.toast.error('Guarda el tablero antes de exportar a XMI');
      return;
    }
    this.exportSvc.downloadXmi(bId);
    this.toast.success('Archivo XMI 2.1 (Enterprise Architect) generado');
  }

  async exportPNG(): Promise<void> {
    const host = this.flowHost?.nativeElement;
    if (!host) return;
    try {
      await this.exportSvc.toPng(host, 'diagram.png');
      this.toast.success('Imagen PNG guardada');
    } catch {
      this.toast.error('Error al exportar PNG');
    }
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

  getRelationCategory(type: string | undefined): 'Association' | 'Generalization' | 'Aggregation' | 'Composition' | 'Dependency' | 'Realization' {
    if (!type) return 'Association';
    const t = type.toLowerCase().trim();
    if (t === 'generalization' || t === 'inheritance') return 'Generalization';
    if (t === 'aggregation') return 'Aggregation';
    if (t === 'composition') return 'Composition';
    if (t === 'dependency') return 'Dependency';
    if (t === 'realization') return 'Realization';
    return 'Association';
  }

  isDashedRelation(type: string | undefined): boolean {
    const cat = this.getRelationCategory(type);
    return cat === 'Dependency' || cat === 'Realization';
  }

  relationIcon(type: string): string {
    const cat = this.getRelationCategory(type);
    if (cat === 'Generalization') return '▷';
    if (cat === 'Realization') return '⇢▷';
    if (cat === 'Aggregation') return '◇';
    if (cat === 'Composition') return '◆';
    if (cat === 'Dependency') return '⇢';
    return '→';
  }

  cardinality(rel: DBRelation, end: 'source' | 'target'): string {
    const parts = rel.type.split(':').map((s) => s.trim());
    if (parts.length === 3) {
      return end === 'source' ? parts[1] : parts[2];
    }
    if (parts.length === 2) {
      const label = end === 'source' ? parts[0] : parts[1];
      return this.expandCardinality(label);
    }
    return '';
  }

  private expandCardinality(v: string | undefined): string {
    switch ((v || '').toUpperCase()) {
      case '1': return '1';
      case 'N':
      case 'M':
      case '*': return '1..*';
      case '0': return '0..1';
      case '0N':
      case '0M':
      case '0*': return '0..*';
      default: return v || '';
    }
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

  shouldWarnGuestLeave(): boolean {
    return !this.auth.isAuthenticated() && (this.diagram.entityCount() > 0 || this.diagram.relationCount() > 0);
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
      this.toolbar?.openDrawer('chat');
    }
    this.proactivity.dismissHint();
  }

  private seedDemoData(): void {
    const hasBadDemo = this.diagram.entities().some((e) =>
      /hola/i.test(e.name) || ['asdas', 'sdfdsfsd', 'sdfds', 'hgh', 'hghg', 'hghh'].includes(e.name.toLowerCase())
    );
    if (hasBadDemo) {
      for (const e of [...this.diagram.entities()]) this.cmd.deleteEntity(e.id);
    }
    if (this.diagram.entityCount() > 0 && !hasBadDemo) return;

    this.cmd.createEntity(
      'User',
      'User',
      [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'email', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'name', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'createdAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
      ],
      { x: 60, y: 60 }
    );

    this.cmd.createEntity(
      'Account',
      'Account',
      [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'ownerId', type: 'UUID', pk: false, fk: true, nullable: false, references: 'User.id', visibility: '#' },
        { name: 'balance', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '-' },
        { name: 'status', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
      ],
      { x: 360, y: 60 }
    );

    this.cmd.createEntity(
      'Order',
      'Order',
      [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'total', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'status', type: 'OrderStatus', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'createdAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
      ],
      { x: 60, y: 300 }
    );

    this.cmd.createEntity(
      'Product',
      'Product',
      [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'name', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'price', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'sku', type: 'String', pk: false, fk: false, nullable: true, references: null, visibility: '#' },
      ],
      { x: 360, y: 300 }
    );

    this.cmd.createEntity(
      'Payment',
      'Payment',
      [
        { name: 'id', type: 'UUID', pk: true, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'amount', type: 'Money', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'method', type: 'String', pk: false, fk: false, nullable: false, references: null, visibility: '+' },
        { name: 'paidAt', type: 'DateTime', pk: false, fk: false, nullable: true, references: null, visibility: '-' },
      ],
      { x: 660, y: 180 }
    );

    this.cmd.createRelation('User', 'Account', 'id', 'ownerId', '1:N');
    this.cmd.createRelation('User', 'Order', 'id', 'id', '1:N');
    this.cmd.createRelation('Order', 'Product', 'id', 'id', 'N:M');
    this.cmd.createRelation('Order', 'Payment', 'id', 'id', '1:1');
  }
}
