import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BoardService, Board } from '../../../../modeling/diagram/services/board.service';
import { AuthService } from '../../../authentication/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { AuthModalComponent } from '../../../authentication/components/auth-modal/auth-modal.component';
import { ProfileModalComponent } from '../../../authentication/components/profile-modal/profile-modal.component';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.models';
import { XmiService } from '../../../../generation/schema/services/xmi.service';

import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { BoardCardComponent } from '../../components/board-card/board-card.component';
import { ProjectCardComponent } from '../../components/project-card/project-card.component';
import { CreateBoardModalComponent } from '../../components/create-board-modal/create-board-modal.component';
import { CreateProjectModalComponent } from '../../components/create-project-modal/create-project-modal.component';
import { ProjectHeaderComponent } from '../../components/project-header/project-header.component';
import { ProjectFiltersComponent } from '../../components/project-filters/project-filters.component';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    FormsModule,
    AuthModalComponent,
    ProfileModalComponent,
    ConfirmDialogComponent,
    BoardCardComponent,
    ProjectCardComponent,
    CreateBoardModalComponent,
    CreateProjectModalComponent,
    ProjectHeaderComponent,
    ProjectFiltersComponent,
  ],
  templateUrl: './home.component.html',
  host: { class: 'block w-full h-full' },
})
export class HomeComponent implements OnInit {
  private boards = inject(BoardService);
  private xmiService = inject(XmiService);
  private projectService = inject(ProjectService);
  private router = inject(Router);
  private toast = inject(ToastService);
  public auth = inject(AuthService);
  public theme = inject(ThemeService);

  activeTab = signal<'boards' | 'projects'>('boards');

  boardsList = signal<Board[]>([]);
  projectsList = signal<Project[]>([]);
  loading = signal(true);
  loadingProjects = signal(false);
  error = signal<string | null>(null);

  showCreateBoard = signal(false);
  creatingBoard = signal(false);

  showCreateProject = signal(false);
  creatingProject = signal(false);

  editingId = signal<string | null>(null);
  editName = signal('');
  searchQuery = signal('');
  viewMode = signal<'grid' | 'list'>('grid');

  deleteBoardTarget = signal<Board | null>(null);
  deleteProjectTarget = signal<Project | null>(null);
  deleting = signal(false);

  showAuthModal = signal(false);
  authLoading = signal(false);
  authError = signal<string | null>(null);
  authSuccess = signal<string | null>(null);
  profileLoading = signal(false);
  profileError = signal<string | null>(null);
  profileSuccess = signal<string | null>(null);

  filteredBoards = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.boardsList();
    if (!q) return list;
    return list.filter((b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
  });

  filteredProjects = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.projectsList();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  });

  ngOnInit(): void {
    this.refresh();
    this.loadProjects();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.boards.list().subscribe({
      next: (list) => {
        this.boardsList.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('No se pudo conectar con el servidor. Revisa que el backend esté corriendo.');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  loadProjects(): void {
    this.loadingProjects.set(true);
    this.projectService.listProjects().subscribe({
      next: (list) => {
        this.projectsList.set(list || []);
        this.loadingProjects.set(false);
      },
      error: (err) => {
        console.error('Error al cargar proyectos:', err);
        this.loadingProjects.set(false);
      },
    });
  }

  // --- Board Actions ---
  openCreateBoard(): void {
    if (!this.auth.isAuthenticated()) {
      this.showAuthModal.set(true);
      return;
    }
    this.showCreateBoard.set(true);
  }

  onCreateBoard(name: string): void {
    if (!name || this.creatingBoard()) return;
    this.creatingBoard.set(true);
    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;
    this.boards.create({ name, owner_id: userId }).subscribe({
      next: (board) => {
        this.creatingBoard.set(false);
        this.showCreateBoard.set(false);
        this.router.navigate(['/board', board.id]);
      },
      error: (err) => {
        this.error.set('No se pudo crear el tablero en el servidor.');
        this.creatingBoard.set(false);
        console.error(err);
      },
    });
  }

  onImportXmi(file: File): void {
    if (!this.auth.isAuthenticated()) {
      this.showAuthModal.set(true);
      return;
    }
    this.creatingBoard.set(true);
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Modelo XMI';
    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;

    this.boards.create({ name: baseName, owner_id: userId }).subscribe({
      next: (board) => {
        this.xmiService.importXmi(board.id, file).subscribe({
          next: () => {
            this.creatingBoard.set(false);
            this.showCreateBoard.set(false);
            this.router.navigate(['/board', board.id]);
          },
          error: () => {
            this.creatingBoard.set(false);
            this.showCreateBoard.set(false);
            this.router.navigate(['/board', board.id]);
          },
        });
      },
      error: (err) => {
        this.error.set('No se pudo crear el tablero para importar el XMI.');
        this.creatingBoard.set(false);
        console.error(err);
      },
    });
  }

  continueLocal(): void {
    this.router.navigate(['/board', 'new']);
  }

  startBoardEdit(data: { board: Board; event: MouseEvent }): void {
    data.event.preventDefault();
    data.event.stopPropagation();
    this.editingId.set(data.board.id);
    this.editName.set(data.board.name);
  }

  cancelBoardEdit(): void {
    this.editingId.set(null);
  }

  saveBoardEdit(data: { board: Board; name: string }): void {
    const trimmed = data.name.trim();
    if (!trimmed || trimmed === data.board.name) {
      this.editingId.set(null);
      return;
    }
    this.boards.update(data.board.id, { name: trimmed }).subscribe({
      next: (updated) => {
        this.boardsList.update((list) => list.map((x) => (x.id === data.board.id ? updated : x)));
        this.editingId.set(null);
      },
      error: (err) => console.error(err),
    });
  }

  askDeleteBoard(data: { board: Board; event: MouseEvent }): void {
    data.event.preventDefault();
    data.event.stopPropagation();
    this.deleteBoardTarget.set(data.board);
  }

  confirmDeleteBoard(): void {
    const b = this.deleteBoardTarget();
    if (!b || this.deleting()) return;
    this.deleting.set(true);
    this.boards.delete(b.id).subscribe({
      next: () => {
        this.boardsList.update((list) => list.filter((x) => x.id !== b.id));
        this.deleteBoardTarget.set(null);
        this.deleting.set(false);
      },
      error: (err) => {
        console.error(err);
        this.deleting.set(false);
      },
    });
  }

  // --- Project Actions ---
  openCreateProject(): void {
    if (!this.auth.isAuthenticated()) {
      this.showAuthModal.set(true);
      return;
    }
    this.showCreateProject.set(true);
  }

  onCreateProject(data: { name: string; description: string | null }): void {
    if (!data.name || this.creatingProject()) return;
    this.creatingProject.set(true);
    this.projectService.createProject(data).subscribe({
      next: (created) => {
        this.projectsList.update((list) => [created, ...list]);
        this.creatingProject.set(false);
        this.showCreateProject.set(false);
      },
      error: (err) => {
        console.error(err);
        this.creatingProject.set(false);
      },
    });
  }

  askDeleteProject(data: { project: Project; event: MouseEvent }): void {
    data.event.preventDefault();
    data.event.stopPropagation();
    this.deleteProjectTarget.set(data.project);
  }

  confirmDeleteProject(): void {
    const p = this.deleteProjectTarget();
    if (!p || this.deleting()) return;
    this.deleting.set(true);
    this.projectService.deleteProject(p.id).subscribe({
      next: () => {
        this.projectsList.update((list) => list.filter((item) => item.id !== p.id));
        this.deleteProjectTarget.set(null);
        this.deleting.set(false);
      },
      error: (err) => {
        console.error(err);
        this.deleting.set(false);
      },
    });
  }

  createBoardInProject(data: { project: Project; event: MouseEvent }): void {
    data.event.preventDefault();
    data.event.stopPropagation();
    this.projectService.createProjectBoard(data.project.id, `${data.project.name} - Tablero`).subscribe({
      next: (b) => {
        this.router.navigate(['/board', b.id]);
      },
      error: (err) => console.error(err),
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
        this.refresh();
        this.loadProjects();
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
        this.refresh();
        this.loadProjects();
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

  onTabChange(tab: 'boards' | 'projects'): void {
    this.activeTab.set(tab);
    if (tab === 'projects') {
      this.loadProjects();
    }
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
}