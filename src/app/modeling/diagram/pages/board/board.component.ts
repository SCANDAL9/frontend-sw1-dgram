import { Component, inject, OnInit, OnDestroy, signal, computed, ViewChild, HostListener } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

import { ToolbarComponent } from '../../components/toolbar/toolbar.component';
import { ExplorerSidebarComponent } from '../../components/explorer-sidebar/explorer-sidebar.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { CanvasComponent } from '../../components/canvas/canvas.component';
import { CommandPaletteComponent } from '../../components/command-palette/command-palette.component';
import { CodegenModalComponent } from '../../../../generation/code/components/codegen-modal/codegen-modal.component';
import { MembersModalComponent } from '../../components/members-modal/members-modal.component';
import { XmiImportPreviewModalComponent } from '../../../../generation/schema/components/xmi-import-preview-modal/xmi-import-preview-modal.component';
import { ToastContainerComponent } from '../../../../core/components/toast-container/toast-container.component';
import { AgentGuideComponent } from '../../../ai/components/agent-guide/agent-guide.component';
import { AuthModalComponent } from '../../../../workspace/authentication/components/auth-modal/auth-modal.component';
import { ProfileModalComponent } from '../../../../workspace/authentication/components/profile-modal/profile-modal.component';
import { HistoryDrawerComponent } from '../../../../workspace/history/components/history-drawer/history-drawer.component';
import { StudioDrawerComponent, DrawerTab } from '../../../ai/components/studio-drawer/studio-drawer.component';
import { ExportScopeModalComponent, ExportFormat } from '../../components/export-scope-modal/export-scope-modal.component';

import { ThemeService } from '../../../../core/services/theme.service';
import { DiagramService } from '../../services/diagram.service';
import { CommandService } from '../../services/command.service';
import { SelectionService } from '../../services/selection.service';
import { PersistenceService } from '../../services/persistence.service';
import { WebsocketService } from '../../services/websocket.service';
import { AuthService } from '../../../../workspace/authentication/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CodegenService } from '../../../../generation/code/services/codegen.service';
import { ProjectClass } from '../../models/board.model';
import { CanWarnGuestLeave } from '../../../../core/guards/guest-leave.guard';

import { BoardDialogService } from '../../services/board-dialog.service';
import { BoardCatalogService } from '../../services/board-catalog.service';
import { BoardExportCoordinatorService } from '../../services/board-export-coordinator.service';

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
export class BoardComponent implements OnInit, OnDestroy, CanWarnGuestLeave {
  private route = inject(ActivatedRoute);
  public diagram = inject(DiagramService);
  private cmd = inject(CommandService);
  public selection = inject(SelectionService);
  private persistence = inject(PersistenceService);
  private ws = inject(WebsocketService);
  public auth = inject(AuthService);
  private toast = inject(ToastService);
  public theme = inject(ThemeService);
  private codegenService = inject(CodegenService);

  public dialogs = inject(BoardDialogService);
  public catalog = inject(BoardCatalogService);
  private exportCoordinator = inject(BoardExportCoordinatorService);

  @ViewChild(CanvasComponent) canvasRef?: CanvasComponent;
  @ViewChild(ToolbarComponent) toolbarRef?: ToolbarComponent;

  boardId = signal<string>('default-board');
  isSidebarOpen = signal<boolean>(true);

  // Delegated Modal & Panel signals from BoardDialogService
  readonly showCommandPalette = this.dialogs.showCommandPalette;
  readonly showCodegenModal = this.dialogs.showCodegenModal;
  readonly codegenFiles = this.dialogs.codegenFiles;
  readonly codegenLoading = this.dialogs.codegenLoading;
  readonly codegenError = this.dialogs.codegenError;
  readonly showMembersModal = this.dialogs.showMembersModal;
  readonly boardMembers = this.dialogs.boardMembers;
  readonly loadingMembers = this.dialogs.loadingMembers;
  readonly invitingMember = this.dialogs.invitingMember;
  readonly membersError = this.dialogs.membersError;
  readonly showAuthModal = this.dialogs.showAuthModal;
  readonly authLoading = this.dialogs.authLoading;
  readonly authError = this.dialogs.authError;
  readonly authSuccess = this.dialogs.authSuccess;
  readonly profileLoading = this.dialogs.profileLoading;
  readonly profileError = this.dialogs.profileError;
  readonly profileSuccess = this.dialogs.profileSuccess;
  readonly showXmiPreviewModal = this.dialogs.showXmiPreviewModal;
  readonly xmiPreviewData = this.dialogs.xmiPreviewData;
  readonly xmiPendingFile = this.dialogs.xmiPendingFile;
  readonly isImportingXmi = this.dialogs.isImportingXmi;
  readonly showStudioDrawer = this.dialogs.showStudioDrawer;
  readonly studioTab = this.dialogs.studioTab;
  readonly showHistoryDrawer = this.dialogs.showHistoryDrawer;
  readonly historyItems = this.dialogs.historyItems;
  readonly historyLoading = this.dialogs.historyLoading;
  readonly historyDetail = this.dialogs.historyDetail;
  readonly historyDetailLoading = this.dialogs.historyDetailLoading;
  readonly historyRestoring = this.dialogs.historyRestoring;
  readonly historyActorFilter = this.dialogs.historyActorFilter;
  readonly showExportScopeModal = this.dialogs.showExportScopeModal;
  readonly exportScopeFormat = this.dialogs.exportScopeFormat;

  // Delegated Catalog signals
  readonly projectCatalogClasses = this.catalog.projectCatalogClasses;
  readonly isLoadingCatalog = this.catalog.isLoadingCatalog;

  readonly codegenDownloadUrl = computed(() => this.codegenService.downloadCodeZipUrl(this.boardId()));

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
          if (action.tab === 'codegen') this.dialogs.openCodegen();
          if (action.tab === 'members') this.dialogs.openMembers(this.boardId());
        }
      } else if (msg.type === 'agent:commands_executed') {
        const data = msg.data;
        const count = data?.commands?.length || 0;
        if (count > 0) {
          this.toast.show(`${data.agent || 'Agente'} aplicó ${count} cambio(s) en el diagrama.`, 'success');
        }
      }
    });

    this.catalog.loadCatalog(id);
  }

  loadProjectCatalog(): void {
    this.catalog.loadCatalog(this.boardId());
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
    this.cmd.setEntityVisibility(entity.id, !currentVis);
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

  // XMI Import Handlers
  onXmiFileSelected(file: File): void {
    this.dialogs.previewXmi(this.boardId(), file);
  }

  confirmXmiImport(): void {
    this.dialogs.confirmXmiImport(this.boardId(), () => {
      this.persistence.saveNow();
      this.catalog.loadCatalog(this.boardId());
    });
  }

  cancelXmiImport(): void {
    this.dialogs.cancelXmiImport();
  }

  // Export Handlers
  exportSQL(): void {
    this.initiateExport('sql');
  }

  exportJSON(): void {
    this.initiateExport('json');
  }

  exportXMI(): void {
    this.initiateExport('xmi');
  }

  exportPNG(): void {
    this.initiateExport('png');
  }

  initiateExport(format: ExportFormat): void {
    const selected = this.canvasRef?.selectedEntityIds() || [];
    if (selected.length > 0) {
      this.dialogs.openExportScope(format);
    } else {
      this.performExport(format, 'all');
    }
  }

  handleScopeSelected(scope: 'selected' | 'all'): void {
    const format = this.exportScopeFormat();
    this.dialogs.closeExportScope();
    this.performExport(format, scope);
  }

  async performExport(format: ExportFormat, scope: 'selected' | 'all'): Promise<void> {
    const selectedIds = scope === 'selected' ? (this.canvasRef?.selectedEntityIds() || []) : undefined;
    await this.exportCoordinator.executeExport(
      format,
      scope,
      this.boardId(),
      selectedIds,
      this.canvasRef?.flowHost?.nativeElement
    );
  }

  // Catalog Actions
  attachProjectClass(cls: ProjectClass): void {
    this.catalog.attachClass(this.boardId(), cls, (id) => this.canvasRef?.jumpToEntity(id));
  }

  detachClass(entityId: string): void {
    this.catalog.detachClass(this.boardId(), entityId, () => this.selectedEntityId.set(null));
  }

  deleteClassFromModel(entityId: string): void {
    this.catalog.deleteClassFromModel(this.boardId(), entityId, () => this.selectedEntityId.set(null));
  }

  handleDeleteCatalogClass(pCls: ProjectClass): void {
    this.catalog.deleteCatalogClass(this.boardId(), pCls);
  }

  // Inspector and Canvas Handlers
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

  // Modals & Drawers Delegations
  openStudioDrawer(tab: DrawerTab = 'chat'): void {
    this.dialogs.openStudio(tab);
  }

  openHistoryDrawer(): void {
    this.dialogs.openHistory(this.boardId());
  }

  loadHistory(actor?: string): void {
    this.dialogs.loadHistory(this.boardId(), actor);
  }

  loadHistoryDetail(itemId: string): void {
    this.dialogs.loadHistoryDetail(this.boardId(), itemId);
  }

  handleRestoreVersion(version: number): void {
    this.dialogs.restoreVersion(this.boardId(), version, () => {
      this.persistence.load(this.boardId());
    });
  }

  handleGenerateCode(basePackage: string): void {
    this.dialogs.generateCode(this.boardId(), basePackage);
  }

  handleCreateClassFromPalette(): void {
    this.toolbarRef?.createDirectTable();
  }

  openMembersModal(): void {
    this.dialogs.openMembers(this.boardId());
  }

  onInviteMember(payload: { email: string; role: 'editor' | 'viewer' }): void {
    this.dialogs.inviteMember(this.boardId(), payload);
  }

  onChangeMemberRole(event: { userId: string; role: 'editor' | 'viewer' }): void {
    this.dialogs.changeMemberRole(this.boardId(), event.userId, event.role);
  }

  onRemoveMember(userId: string): void {
    this.dialogs.removeMember(this.boardId(), userId);
  }

  handleLogin(creds: { email: string; password: string }): void {
    this.dialogs.handleLogin(creds);
  }

  handleRegister(payload: { email: string; fullName: string; password: string }): void {
    this.dialogs.handleRegister(payload);
  }

  handleForgotPassword(email: string): void {
    this.dialogs.handleForgotPassword(email);
  }

  handleResetPassword(payload: { token: string; newPassword: string }): void {
    this.dialogs.handleResetPassword(payload);
  }

  handleUpdateProfile(payload: { fullName: string; avatarUrl?: string }): void {
    this.dialogs.handleUpdateProfile(payload);
  }

  handleChangePassword(payload: { currentPassword: string; newPassword: string }): void {
    this.dialogs.handleChangePassword(payload);
  }

  shouldWarnGuestLeave(): boolean {
    return !this.auth.isAuthenticated() && (this.diagram.entityCount() > 0 || this.diagram.relationCount() > 0);
  }

  ngOnDestroy(): void {
    this.ws.disconnect();
    this.persistence.deactivateSave();
    this.diagram.clearState();
    this.cmd.clearHistory();
  }
}
