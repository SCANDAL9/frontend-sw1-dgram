import { Component, inject, OnInit, signal, computed, ViewChild, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { ExplorerSidebarComponent } from '../../components/explorer-sidebar/explorer-sidebar.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { CanvasComponent } from '../../components/canvas/canvas.component';
import { CommandPaletteComponent } from '../../components/command-palette/command-palette.component';
import { CodegenModalComponent } from '../../../../generation/code/components/codegen-modal/codegen-modal.component';
import { MembersModalComponent } from '../../components/members-modal/members-modal.component';
import { ProjectService } from '../../../../workspace/projects/services/project.service';
import { XmiImportPreviewModalComponent } from '../../../../generation/schema/components/xmi-import-preview-modal/xmi-import-preview-modal.component';
import { ToastContainerComponent } from '../../../../core/components/toast-container/toast-container.component';
import { AgentGuideComponent } from '../../../ai/components/agent-guide/agent-guide.component';
import { AuthModalComponent } from '../../../../workspace/authentication/components/auth-modal/auth-modal.component';
import { ProfileModalComponent } from '../../../../workspace/authentication/components/profile-modal/profile-modal.component';
import { HistoryDrawerComponent } from '../../../../workspace/history/components/history-drawer/history-drawer.component';
import { StudioDrawerComponent, DrawerTab } from '../../../ai/components/studio-drawer/studio-drawer.component';
import { HistoryApiService } from '../../../../workspace/history/services/history-api.service';
import { HistoryItem, HistoryDetail } from '../../../../workspace/history/models/history.model';
import { CodegenService } from '../../../../generation/code/services/codegen.service';
import { ThemeService } from '../../../../core/services/theme.service';

import { DiagramService } from '../../services/diagram.service';
import { CommandService } from '../../services/command.service';
import { SelectionService } from '../../services/selection.service';
import { PersistenceService } from '../../services/persistence.service';
import { WebsocketService } from '../../services/websocket.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';
import { BoardService } from '../../services/board.service';
import { ProjectClass, BoardMember } from '../../models/board.model';
import { ExportService } from '../../../../generation/schema/services/export.service';
import { XmiService } from '../../../../generation/schema/services/xmi.service';
import { ToastService } from '../../../../core/services/toast.service';
import { XmiPreviewResponse } from '../../../../generation/schema/models/xmi-preview.model';
import { CanWarnGuestLeave } from '../../../../core/guards/guest-leave.guard';
import { ExportScopeModalComponent, ExportFormat } from '../../components/export-scope-modal/export-scope-modal.component';

@Component({
  selector: 'app-board-page',
  standalone: true,
  imports: [
    CommonModule,
    ToolbarComponent,
    ExplorerSidebarComponent,
    SidebarComponent,
    CanvasComponent,
    CommandPaletteComponent,
    CodegenModalComponent,
    MembersModalComponent,
    XmiImportPreviewModalComponent,
    ToastContainerComponent,
    AgentGuideComponent,
    AuthModalComponent,
    ProfileModalComponent,
    HistoryDrawerComponent,
    StudioDrawerComponent,
    ExportScopeModalComponent,
  ],
  templateUrl: './board.component.html',
  host: { class: 'block w-full h-full overflow-hidden' },
})
export class BoardComponent implements OnInit, CanWarnGuestLeave {
  private route = inject(ActivatedRoute);
  public diagram = inject(DiagramService);
  private cmd = inject(CommandService);
  public selection = inject(SelectionService);
  private persistence = inject(PersistenceService);
  private ws = inject(WebsocketService);
  public auth = inject(AuthService);
  private boardSvc = inject(BoardService);
  private exportSvc = inject(ExportService);
  private xmiSvc = inject(XmiService);
  private toast = inject(ToastService);
  private projectSvc = inject(ProjectService);
  public theme = inject(ThemeService);
  private historyApi = inject(HistoryApiService);
  private codegenService = inject(CodegenService);

  @ViewChild(CanvasComponent) canvasRef?: CanvasComponent;
  @ViewChild(ToolbarComponent) toolbarRef?: ToolbarComponent;

  boardId = signal<string>('default-board');
  isSidebarOpen = signal<boolean>(true);

  // Modals
  showCommandPalette = signal<boolean>(false);
  showCodegenModal = signal<boolean>(false);
  showMembersModal = signal<boolean>(false);
  showAuthModal = signal<boolean>(false);
  authLoading = signal<boolean>(false);
  authError = signal<string | null>(null);
  authSuccess = signal<string | null>(null);
  profileLoading = signal<boolean>(false);
  profileError = signal<string | null>(null);
  profileSuccess = signal<string | null>(null);
  showXmiPreviewModal = signal<boolean>(false);
  xmiPreviewData = signal<XmiPreviewResponse | null>(null);
  xmiPendingFile = signal<File | null>(null);
  isImportingXmi = signal<boolean>(false);

  // Studio Drawer State
  showStudioDrawer = signal<boolean>(false);
  studioTab = signal<DrawerTab>('chat');

  // History State
  showHistoryDrawer = signal<boolean>(false);
  historyItems = signal<HistoryItem[]>([]);
  historyLoading = signal<boolean>(false);
  historyDetail = signal<HistoryDetail | null>(null);
  historyDetailLoading = signal<boolean>(false);
  historyRestoring = signal<boolean>(false);
  historyActorFilter = signal<string>('all');

  // Codegen State
  codegenFiles = signal<Record<string, string>>({});
  codegenLoading = signal<boolean>(false);
  codegenError = signal<string | null>(null);
  readonly codegenDownloadUrl = computed(() => this.codegenService.downloadCodeZipUrl(this.boardId()));

  // Members State
  boardMembers = signal<BoardMember[]>([]);
  loadingMembers = signal<boolean>(false);
  invitingMember = signal<boolean>(false);
  membersError = signal<string | null>(null);

  // Selections and Tree State
  selectedEntityId = signal<string | null>(null);
  selectedRelationId = signal<string | null>(null);
  expandedEntityIds = signal<Set<string>>(new Set());

  readonly selectedEntity = computed(() => {
    const id = this.selectedEntityId();
    return id ? this.diagram.getEntity(id) || null : null;
  });

  readonly availableEntityDataTypes = computed(() => {
    return (this.diagram.entities() || [])
      .filter((e) => {
        const t = (e.elementType || e.stereotype || '').toLowerCase();
        return t === 'enumeration' || t === 'enum' || t === 'datatype' || t === 'data_type';
      })
      .map((e) => e.name)
      .filter(Boolean);
  });

  // Project Catalog Classes
  projectCatalogClasses = signal<ProjectClass[]>([]);
  isLoadingCatalog = signal<boolean>(false);

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.shouldWarnGuestLeave()) {
      e.preventDefault();
      e.returnValue = 'Estás en modo invitado. Si recargas o sales de la página perderás la información añadida.';
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || 'default-board';
    this.boardId.set(id);

    // Initialize local persistence
    this.persistence.load(id);
    this.persistence.activateSave(id);

    // Initialize collaborative WebSocket connection
    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;
    const token = this.auth.token() || undefined;
    this.ws.connect(id, userId, token);

    this.ws.onMessage((msg) => {
      if (msg.type === 'agent:ui_action') {
        const action = msg.data;
        if (action?.action_type === 'highlight' || action?.action_type === 'focus') {
          if (action.target_id) {
            const target = action.target_id.toLowerCase();
            const entity = this.diagram.entities().find(
              (e) => e.id === action.target_id || (e.name && e.name.toLowerCase() === target)
            );
            if (entity) {
              this.onEntitySelected(entity.id);
            }
          }
          if (action.message) {
            this.toast.info(action.message);
          }
        } else if (action?.action_type === 'open_panel') {
          if (action.tab === 'codegen') this.showCodegenModal.set(true);
          if (action.tab === 'members') this.openMembersModal();
        }
      } else if (msg.type === 'agent:commands_executed') {
        const data = msg.data;
        const count = data?.commands?.length || 0;
        if (count > 0) {
          this.toast.show(`${data.agent || 'Agente'} aplicó ${count} cambio(s) en el diagrama.`, 'success');
        }
      }
    });

    this.loadProjectCatalog();
  }

  loadProjectCatalog(): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') {
      this.projectCatalogClasses.set([]);
      return;
    }
    this.isLoadingCatalog.set(true);
    this.boardSvc.getProjectClasses(bId).subscribe({
      next: (classes) => {
        this.projectCatalogClasses.set(classes || []);
        this.isLoadingCatalog.set(false);
      },
      error: () => {
        this.isLoadingCatalog.set(false);
      },
    });
  }

  toggleSidebar(): void {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  toggleExpandEntity(entityId: string): void {
    const next = new Set(this.expandedEntityIds());
    if (next.has(entityId)) {
      next.delete(entityId);
    } else {
      next.add(entityId);
    }
    this.expandedEntityIds.set(next);
  }

  toggleEntityVisibility(entityId: string): void {
    const entity = this.diagram.getEntity(entityId);
    if (!entity) return;
    const currentVis = entity.isVisible !== false && entity.is_visible !== false;
    const newVis = !currentVis;
    this.cmd.setEntityVisibility(entity.id, newVis);
  }

  toggleAllEntitiesExpand(): void {
    const ents = this.diagram.entities();
    if (this.expandedEntityIds().size === ents.length) {
      this.expandedEntityIds.set(new Set());
    } else {
      this.expandedEntityIds.set(new Set(ents.map((e) => e.id)));
    }
  }

  onEntitySelected(entityId: string): void {
    this.selectedEntityId.set(entityId);
    this.selectedRelationId.set(null);
    this.canvasRef?.selectEntity(entityId);
  }

  onRelationSelected(relationId: string): void {
    this.selectedRelationId.set(relationId);
    this.selectedEntityId.set(null);
    this.canvasRef?.onSelectAssociation(relationId);
  }

  onXmiFileSelected(file: File): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') {
      this.toast.error('Abre o crea un tablero para importar el modelo XMI');
      return;
    }

    this.xmiSvc.previewXmi(bId, file).subscribe({
      next: (preview) => {
        this.xmiPreviewData.set(preview);
        this.xmiPendingFile.set(file);
        this.showXmiPreviewModal.set(true);
      },
      error: (err) => {
        const msg = err.error?.detail || 'Error al procesar la previsualización del archivo XMI';
        this.toast.error(msg);
      },
    });
  }

  confirmXmiImport(): void {
    const bId = this.boardId();
    const file = this.xmiPendingFile();
    if (!bId || !file) return;

    this.isImportingXmi.set(true);
    this.xmiSvc.importXmi(bId, file).subscribe({
      next: (res) => {
        this.isImportingXmi.set(false);
        this.showXmiPreviewModal.set(false);
        this.xmiPendingFile.set(null);
        this.xmiPreviewData.set(null);
        const updatedMsg = res.updated_classes?.length ? `, ${res.updated_classes.length} actualizadas` : '';
        this.toast.success(`Modelo XMI importado: ${res.classes.length} creadas${updatedMsg}`);
        this.persistence.saveNow();
        this.loadProjectCatalog();
      },
      error: (err) => {
        this.isImportingXmi.set(false);
        const msg = err.error?.detail || 'Error al importar archivo XMI de Enterprise Architect';
        this.toast.error(msg);
      },
    });
  }

  cancelXmiImport(): void {
    this.showXmiPreviewModal.set(false);
    this.xmiPendingFile.set(null);
    this.xmiPreviewData.set(null);
  }

  showExportScopeModal = signal(false);
  exportScopeFormat = signal<ExportFormat>('png');

  exportSQL(): void {
    this.initiateExport('sql');
  }

  exportJSON(): void {
    this.initiateExport('json');
  }

  exportXMI(): void {
    this.initiateExport('xmi');
  }

  async exportPNG(): Promise<void> {
    this.initiateExport('png');
  }

  initiateExport(format: ExportFormat): void {
    const selected = this.canvasRef?.selectedEntityIds() || [];
    if (selected.length > 0) {
      this.exportScopeFormat.set(format);
      this.showExportScopeModal.set(true);
    } else {
      this.performExport(format, 'all');
    }
  }

  handleScopeSelected(scope: 'selected' | 'all'): void {
    const format = this.exportScopeFormat();
    this.showExportScopeModal.set(false);
    this.performExport(format, scope);
  }

  async performExport(format: ExportFormat, scope: 'selected' | 'all'): Promise<void> {
    const selectedIds = scope === 'selected' ? (this.canvasRef?.selectedEntityIds() || []) : undefined;
    switch (format) {
      case 'sql':
        this.exportSvc.downloadSql(selectedIds);
        this.toast.success(scope === 'selected' ? 'Script SQL (seleccionados) descargado' : 'Script SQL descargado');
        break;
      case 'json':
        this.exportSvc.downloadJson(selectedIds);
        this.toast.success(scope === 'selected' ? 'Esquema JSON (seleccionados) descargado' : 'Esquema JSON descargado');
        break;
      case 'xmi': {
        const bId = this.boardId();
        if (!bId || bId === 'default-board') {
          this.toast.error('Guarda el tablero antes de exportar a XMI');
          return;
        }
        try {
          await firstValueFrom(this.exportSvc.downloadXmi(bId, 'diagram.xmi', selectedIds));
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
        const host = this.canvasRef?.flowHost?.nativeElement;
        if (!host) return;
        try {
          await this.exportSvc.toPng(host, 'diagram.png', selectedIds);
          this.toast.success(scope === 'selected' ? 'Imagen PNG (seleccionados) guardada' : 'Imagen PNG guardada');
        } catch {
          this.toast.error('Error al exportar PNG');
        }
        break;
      }
    }
  }

  attachProjectClass(cls: ProjectClass): void {
    const bId = this.boardId();
    const existing = this.diagram.entities().find((e) => e.id === cls.id || e.name === cls.name);
    if (existing) {
      this.toast.info(`La clase "${cls.name}" ya está presente en este tablero`);
      this.canvasRef?.jumpToEntity(existing.id);
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

  detachClass(entityId: string): void {
    const ent = this.diagram.getEntity(entityId);
    const name = ent?.name || entityId;
    this.cmd.deleteEntity(entityId);
    this.selectedEntityId.set(null);

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

  deleteClassFromModel(entityId: string): void {
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
    this.selectedEntityId.set(null);

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

  handleDeleteCatalogClass(pCls: ProjectClass): void {
    if (
      !confirm(
        `¿Eliminar definitivamente la clase "${pCls.name}" del catálogo del proyecto?\n\nEsta acción la borrará permanentemente de todos los tableros y del modelo.`
      )
    ) {
      return;
    }
    const bId = this.boardId();
    if (bId && bId !== 'default-board') {
      this.boardSvc.deleteClassFromModel(bId, pCls.id).subscribe({
        next: () => {
          this.toast.success(`Clase "${pCls.name}" eliminada del catálogo`);
          const onCanvas = this.diagram
            .entities()
            .find(
              (e) =>
                e.id === pCls.id ||
                e.name.toLowerCase() === pCls.name.toLowerCase()
            );
          if (onCanvas) {
            this.cmd.deleteEntity(onCanvas.id);
          }
          this.loadProjectCatalog();
        },
        error: () => {
          this.toast.error(`Error al eliminar "${pCls.name}" del catálogo`);
          this.loadProjectCatalog();
        },
      });
    }
  }

  handleEntityNameChanged(e: { id: string; name: string }): void {
    this.cmd.updateEntity(e.id, e.name);
  }

  handleClassifierTypeChanged(e: { id: string; val: string; isAbstract: boolean }): void {
    const currentName = this.diagram.getEntity(e.id)?.name || 'Class';
    this.cmd.updateEntity(e.id, currentName, {
      element_type: e.val,
      elementType: e.val,
      stereotype: e.val !== 'class' ? e.val : null,
      is_abstract: e.isAbstract,
    } as any);
  }

  handleStereotypeChanged(e: { id: string; stereotype: string | null }): void {
    const currentName = this.diagram.getEntity(e.id)?.name || 'Class';
    this.cmd.updateEntity(e.id, currentName, { stereotype: e.stereotype });
  }

  handleAbstractToggled(e: { id: string; isAbstract: boolean }): void {
    const currentName = this.diagram.getEntity(e.id)?.name || 'Class';
    this.cmd.updateEntity(e.id, currentName, { is_abstract: e.isAbstract });
  }

  handleEntityDeleted(id: string): void {
    this.cmd.deleteEntity(id);
    this.selectedEntityId.set(null);
  }

  handleColumnAdded(e: { id: string; col: any }): void {
    this.cmd.addColumn(e.id, e.col);
  }

  handleColumnDeleted(e: { id: string; colName: string }): void {
    this.cmd.deleteColumn(e.id, e.colName);
  }

  handleColumnUpdated(e: { id: string; colName: string; changes: any }): void {
    this.cmd.updateColumn(e.id, e.colName, e.changes);
  }

  handlePackageAssigned(e: { id: string; pkgId: string }): void {
    this.cmd.assignClassPackage(e.id, e.pkgId);
  }

  handlePackageCreatedAndAssigned(e: { id: string; name: string }): void {
    const pkgId = `pkg-${Date.now()}`;
    this.cmd.createPackage(e.name, pkgId);
    this.cmd.assignClassPackage(e.id, pkgId);
  }

  openStudioDrawer(tab: DrawerTab = 'chat'): void {
    this.studioTab.set(tab);
    this.showStudioDrawer.set(true);
  }

  openHistoryDrawer(): void {
    this.showHistoryDrawer.set(true);
    this.loadHistory();
  }

  loadHistory(actor?: string): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    if (actor !== undefined) {
      this.historyActorFilter.set(actor);
    }
    const currentActor = this.historyActorFilter();
    const filter = currentActor === 'all' ? undefined : (currentActor as any);
    this.historyLoading.set(true);
    this.historyApi.getHistory(bId, filter).subscribe({
      next: (items) => {
        this.historyItems.set(items);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.toast.error('Error al cargar el historial de versiones');
      },
    });
  }

  loadHistoryDetail(itemId: string): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.historyDetailLoading.set(true);
    this.historyDetail.set(null);
    this.historyApi.getHistoryDetail(bId, itemId).subscribe({
      next: (detail) => {
        this.historyDetail.set(detail);
        this.historyDetailLoading.set(false);
      },
      error: () => {
        this.historyDetailLoading.set(false);
        this.toast.error('Error al cargar detalle de versión');
      },
    });
  }

  handleRestoreVersion(version: number): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    if (!confirm(`¿Estás seguro de restaurar a la versión v${version}? Se creará una nueva versión con el estado anterior.`)) {
      return;
    }
    this.historyRestoring.set(true);
    this.historyApi.restoreVersion(bId, version).subscribe({
      next: (res) => {
        this.historyRestoring.set(false);
        this.toast.success(`Tablero restaurado a v${version} (Nueva versión v${res.restored_version})`);
        this.persistence.load(bId);
        this.loadHistory();
      },
      error: (err) => {
        this.historyRestoring.set(false);
        this.toast.error(err?.error?.detail || 'Error al restaurar versión');
      },
    });
  }

  handleGenerateCode(basePackage: string): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.codegenLoading.set(true);
    this.codegenError.set(null);
    this.codegenService.generateCode(bId, basePackage).subscribe({
      next: (res) => {
        this.codegenFiles.set(res.files);
        this.codegenLoading.set(false);
        this.toast.success(`Código generado (${Object.keys(res.files).length} archivos)`);
      },
      error: (err) => {
        this.codegenLoading.set(false);
        this.codegenError.set(err?.error?.detail || 'Error al generar código');
      },
    });
  }

  handleCreateClassFromPalette(): void {
    this.toolbarRef?.createDirectTable();
  }

  openMembersModal(): void {
    this.showMembersModal.set(true);
    this.loadBoardMembers();
  }

  loadBoardMembers(): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') {
      this.boardMembers.set([]);
      return;
    }
    this.loadingMembers.set(true);
    this.membersError.set(null);
    this.projectSvc.listBoardMembers(bId).subscribe({
      next: (members) => {
        this.boardMembers.set(members);
        this.loadingMembers.set(false);
      },
      error: (err) => {
        this.membersError.set(err?.error?.detail || 'Error al cargar miembros del tablero');
        this.loadingMembers.set(false);
      },
    });
  }

  onInviteMember(payload: { email: string; role: 'editor' | 'viewer' }): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.invitingMember.set(true);
    this.membersError.set(null);
    this.projectSvc.inviteBoardMember(bId, payload).subscribe({
      next: () => {
        this.invitingMember.set(false);
        this.toast.success(`Invitación enviada a ${payload.email}`);
        this.loadBoardMembers();
      },
      error: (err) => {
        this.invitingMember.set(false);
        this.membersError.set(err?.error?.detail || 'Error al enviar invitación');
      },
    });
  }

  onChangeMemberRole(event: { userId: string; role: 'editor' | 'viewer' }): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.projectSvc.updateBoardMemberRole(bId, event.userId, event.role).subscribe({
      next: () => {
        this.toast.success('Rol actualizado');
        this.loadBoardMembers();
      },
      error: (err) => {
        this.toast.error(err?.error?.detail || 'Error al actualizar rol');
      },
    });
  }

  onRemoveMember(userId: string): void {
    const bId = this.boardId();
    if (!bId || bId === 'default-board') return;
    this.projectSvc.removeBoardMember(bId, userId).subscribe({
      next: () => {
        this.toast.info('Miembro eliminado');
        this.loadBoardMembers();
      },
      error: (err) => {
        this.toast.error(err?.error?.detail || 'Error al eliminar miembro');
      },
    });
  }

  handleLogin(creds: { email: string; password: string }): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.auth.login(creds.email, creds.password).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.showAuthModal.set(false);
        this.toast.success('Sesión iniciada correctamente');
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al iniciar sesión');
      },
    });
  }

  handleRegister(payload: { email: string; fullName: string; password: string }): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.auth.register(payload.email, payload.fullName, payload.password).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.showAuthModal.set(false);
        this.toast.success('Cuenta creada exitosamente');
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al registrarse');
      },
    });
  }

  handleForgotPassword(email: string): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.authSuccess.set(null);
    this.auth.forgotPassword(email).subscribe({
      next: (res) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al solicitar recuperación');
      },
    });
  }

  handleResetPassword(payload: { token: string; newPassword: string }): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.authSuccess.set(null);
    this.auth.resetPassword(payload.token, payload.newPassword).subscribe({
      next: (res) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
        this.toast.success('Contraseña restablecida correctamente');
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al restablecer contraseña');
      },
    });
  }

  handleUpdateProfile(payload: { fullName: string; avatarUrl?: string }): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    this.auth
      .updateProfile({
        full_name: payload.fullName,
        avatar_url: payload.avatarUrl,
      })
      .subscribe({
      next: () => {
        this.profileLoading.set(false);
        this.profileSuccess.set('Perfil actualizado exitosamente');
        this.toast.success('Perfil actualizado');
      },
      error: (err) => {
        this.profileLoading.set(false);
        this.profileError.set(err.error?.detail || 'Error al actualizar perfil');
      },
    });
  }

  handleChangePassword(payload: { currentPassword: string; newPassword: string }): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    this.auth.changePassword(payload.currentPassword, payload.newPassword).subscribe({
      next: (res) => {
        this.profileLoading.set(false);
        this.profileSuccess.set(res.message);
        this.toast.success('Contraseña cambiada');
      },
      error: (err) => {
        this.profileLoading.set(false);
        this.profileError.set(err.error?.detail || 'Error al cambiar contraseña');
      },
    });
  }

  shouldWarnGuestLeave(): boolean {
    return !this.auth.isAuthenticated() && (this.diagram.entityCount() > 0 || this.diagram.relationCount() > 0);
  }
}
