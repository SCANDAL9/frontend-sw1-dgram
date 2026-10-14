import { Injectable, inject, signal } from '@angular/core';
import { CodegenService } from '../../../generation/code/services/codegen.service';
import { ProjectService } from '../../../workspace/projects/services/project.service';
import { HistoryApiService } from '../../../workspace/history/services/history-api.service';
import { XmiService } from '../../../generation/schema/services/xmi.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../workspace/authentication/services/auth.service';
import { BoardMember } from '../models/board.model';
import { HistoryItem, HistoryDetail } from '../../../workspace/history/models/history.model';
import { XmiPreviewResponse } from '../../../generation/schema/models/xmi-preview.model';
import { DrawerTab } from '../../ai/components/studio-drawer/studio-drawer.component';
import { ExportFormat } from '../components/export-scope-modal/export-scope-modal.component';

@Injectable({
  providedIn: 'root',
})
export class BoardDialogService {
  private codegenService: CodegenService = inject(CodegenService);
  private projectSvc: ProjectService = inject(ProjectService);
  private historyApi: HistoryApiService = inject(HistoryApiService);
  private xmiSvc: XmiService = inject(XmiService);
  private toast: ToastService = inject(ToastService);
  private auth: AuthService = inject(AuthService);

  // Modals & Panels visibility
  readonly showCommandPalette = signal<boolean>(false);
  readonly showCodegenModal = signal<boolean>(false);
  readonly showMembersModal = signal<boolean>(false);
  readonly showAuthModal = signal<boolean>(false);
  readonly showXmiPreviewModal = signal<boolean>(false);
  readonly showHistoryDrawer = signal<boolean>(false);
  readonly showStudioDrawer = signal<boolean>(false);
  readonly showExportScopeModal = signal<boolean>(false);

  // Tab & Format states
  readonly studioTab = signal<DrawerTab>('chat');
  readonly exportScopeFormat = signal<ExportFormat>('png');

  // Codegen state
  readonly codegenFiles = signal<Record<string, string>>({});
  readonly codegenLoading = signal<boolean>(false);
  readonly codegenError = signal<string | null>(null);

  // Members state
  readonly boardMembers = signal<BoardMember[]>([]);
  readonly loadingMembers = signal<boolean>(false);
  readonly invitingMember = signal<boolean>(false);
  readonly membersError = signal<string | null>(null);

  // XMI state
  readonly xmiPreviewData = signal<XmiPreviewResponse | null>(null);
  readonly xmiPendingFile = signal<File | null>(null);
  readonly isImportingXmi = signal<boolean>(false);

  // History state
  readonly historyItems = signal<HistoryItem[]>([]);
  readonly historyLoading = signal<boolean>(false);
  readonly historyDetail = signal<HistoryDetail | null>(null);
  readonly historyDetailLoading = signal<boolean>(false);
  readonly historyRestoring = signal<boolean>(false);
  readonly historyActorFilter = signal<string>('all');

  // Auth & Profile state
  readonly authLoading = signal<boolean>(false);
  readonly authError = signal<string | null>(null);
  readonly authSuccess = signal<string | null>(null);
  readonly profileLoading = signal<boolean>(false);
  readonly profileError = signal<string | null>(null);
  readonly profileSuccess = signal<string | null>(null);

  // Codegen actions
  openCodegen(): void {
    this.showCodegenModal.set(true);
  }

  closeCodegen(): void {
    this.showCodegenModal.set(false);
  }

  generateCode(boardId: string, basePackage: string): void {
    if (!boardId || boardId === 'default-board') return;
    this.codegenLoading.set(true);
    this.codegenError.set(null);
    this.codegenService.generateCode(boardId, basePackage).subscribe({
      next: (res: { files: Record<string, string> }) => {
        this.codegenFiles.set(res.files);
        this.codegenLoading.set(false);
        this.toast.success(`Código generado (${Object.keys(res.files).length} archivos)`);
      },
      error: (err: any) => {
        this.codegenLoading.set(false);
        this.codegenError.set(err?.error?.detail || 'Error al generar código');
      },
    });
  }

  // Members actions
  openMembers(boardId: string): void {
    this.showMembersModal.set(true);
    this.loadBoardMembers(boardId);
  }

  closeMembers(): void {
    this.showMembersModal.set(false);
  }

  loadBoardMembers(boardId: string): void {
    if (!boardId || boardId === 'default-board') {
      this.boardMembers.set([]);
      return;
    }
    this.loadingMembers.set(true);
    this.membersError.set(null);
    this.projectSvc.listBoardMembers(boardId).subscribe({
      next: (members: BoardMember[]) => {
        this.boardMembers.set(members);
        this.loadingMembers.set(false);
      },
      error: (err: any) => {
        this.membersError.set(err?.error?.detail || 'Error al cargar miembros del tablero');
        this.loadingMembers.set(false);
      },
    });
  }

  inviteMember(boardId: string, payload: { email: string; role: 'editor' | 'viewer' }): void {
    if (!boardId || boardId === 'default-board') return;
    this.invitingMember.set(true);
    this.membersError.set(null);
    this.projectSvc.inviteBoardMember(boardId, payload).subscribe({
      next: () => {
        this.invitingMember.set(false);
        this.toast.success(`Invitación enviada a ${payload.email}`);
        this.loadBoardMembers(boardId);
      },
      error: (err: any) => {
        this.invitingMember.set(false);
        this.membersError.set(err?.error?.detail || 'Error al invitar miembro');
      },
    });
  }

  changeMemberRole(boardId: string, memberId: string, role: 'editor' | 'viewer'): void {
    this.projectSvc.updateBoardMemberRole(boardId, memberId, role).subscribe({
      next: () => {
        this.toast.success('Rol de miembro actualizado');
        this.loadBoardMembers(boardId);
      },
      error: (err: any) => {
        this.toast.error(err?.error?.detail || 'Error al actualizar rol');
      },
    });
  }

  removeMember(boardId: string, memberId: string): void {
    if (!confirm('¿Seguro que deseas revocar el acceso a este miembro?')) return;
    this.projectSvc.removeBoardMember(boardId, memberId).subscribe({
      next: () => {
        this.toast.success('Miembro eliminado del tablero');
        this.loadBoardMembers(boardId);
      },
      error: (err: any) => {
        this.toast.error(err?.error?.detail || 'Error al eliminar miembro');
      },
    });
  }

  // XMI actions
  previewXmi(boardId: string, file: File): void {
    if (!boardId || boardId === 'default-board') {
      this.toast.error('Abre o crea un tablero para importar el modelo XMI');
      return;
    }
    this.xmiSvc.previewXmi(boardId, file).subscribe({
      next: (preview: XmiPreviewResponse) => {
        this.xmiPreviewData.set(preview);
        this.xmiPendingFile.set(file);
        this.showXmiPreviewModal.set(true);
      },
      error: (err: any) => {
        const msg = err.error?.detail || 'Error al procesar la previsualización del archivo XMI';
        this.toast.error(msg);
      },
    });
  }

  confirmXmiImport(boardId: string, onImportSuccess: () => void): void {
    const file = this.xmiPendingFile();
    if (!boardId || !file) return;

    this.isImportingXmi.set(true);
    this.xmiSvc.importXmi(boardId, file).subscribe({
      next: (res: any) => {
        this.isImportingXmi.set(false);
        this.showXmiPreviewModal.set(false);
        this.xmiPendingFile.set(null);
        this.xmiPreviewData.set(null);
        const updatedMsg = res.updated_classes?.length ? `, ${res.updated_classes.length} actualizadas` : '';
        this.toast.success(`Modelo XMI importado: ${res.classes.length} creadas${updatedMsg}`);
        onImportSuccess();
      },
      error: (err: any) => {
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

  // History actions
  openHistory(boardId: string, actor?: string): void {
    this.showHistoryDrawer.set(true);
    this.loadHistory(boardId, actor);
  }

  closeHistory(): void {
    this.showHistoryDrawer.set(false);
  }

  loadHistory(boardId: string, actor?: string): void {
    if (!boardId || boardId === 'default-board') return;
    if (actor !== undefined) {
      this.historyActorFilter.set(actor);
    }
    const currentActor = this.historyActorFilter();
    const filter = currentActor === 'all' ? undefined : (currentActor as any);
    this.historyLoading.set(true);
    this.historyApi.getHistory(boardId, filter).subscribe({
      next: (items: HistoryItem[]) => {
        this.historyItems.set(items);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.toast.error('Error al cargar el historial de versiones');
      },
    });
  }

  loadHistoryDetail(boardId: string, itemId: string): void {
    if (!boardId || boardId === 'default-board') return;
    this.historyDetailLoading.set(true);
    this.historyDetail.set(null);
    this.historyApi.getHistoryDetail(boardId, itemId).subscribe({
      next: (detail: HistoryDetail) => {
        this.historyDetail.set(detail);
        this.historyDetailLoading.set(false);
      },
      error: () => {
        this.historyDetailLoading.set(false);
        this.toast.error('Error al cargar detalle de versión');
      },
    });
  }

  restoreVersion(boardId: string, version: number, onRestoreSuccess: () => void): void {
    if (!boardId || boardId === 'default-board') return;
    if (!confirm(`¿Estás seguro de restaurar a la versión v${version}? Se creará una nueva versión con el estado anterior.`)) {
      return;
    }
    this.historyRestoring.set(true);
    this.historyApi.restoreVersion(boardId, version).subscribe({
      next: (res: any) => {
        this.historyRestoring.set(false);
        this.toast.success(`Tablero restaurado a v${version} (Nueva versión v${res.restored_version})`);
        onRestoreSuccess();
        this.loadHistory(boardId);
      },
      error: (err: any) => {
        this.historyRestoring.set(false);
        this.toast.error(err?.error?.detail || 'Error al restaurar versión');
      },
    });
  }

  // Studio Drawer actions
  openStudio(tab: DrawerTab = 'chat'): void {
    this.studioTab.set(tab);
    this.showStudioDrawer.set(true);
  }

  closeStudio(): void {
    this.showStudioDrawer.set(false);
  }

  // Export scope actions
  openExportScope(format: ExportFormat): void {
    this.exportScopeFormat.set(format);
    this.showExportScopeModal.set(true);
  }

  closeExportScope(): void {
    this.showExportScopeModal.set(false);
  }

  // Auth & Profile actions
  handleLogin(creds: { email: string; password: string }): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.auth.login(creds.email, creds.password).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.showAuthModal.set(false);
        this.toast.success('Sesión iniciada correctamente');
      },
      error: (err: any) => {
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
      error: (err: any) => {
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
      next: (res: any) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
      },
      error: (err: any) => {
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
      next: (res: any) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
        this.toast.success('Contraseña restablecida correctamente');
      },
      error: (err: any) => {
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
        error: (err: any) => {
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
      next: (res: any) => {
        this.profileLoading.set(false);
        this.profileSuccess.set(res.message);
        this.toast.success('Contraseña cambiada');
      },
      error: (err: any) => {
        this.profileLoading.set(false);
        this.profileError.set(err.error?.detail || 'Error al cambiar contraseña');
      },
    });
  }
}
