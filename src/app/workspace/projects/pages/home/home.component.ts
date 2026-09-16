import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BoardService, Board } from '../../../../modeling/diagram/services/board.service';
import { AuthService } from '../../../authentication/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { AuthModalComponent } from '../../../authentication/components/auth-modal/auth-modal.component';


@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, AuthModalComponent],
  templateUrl: './home.component.html',
  host: { class: 'block w-full h-full' },
})
export class HomeComponent implements OnInit {
  private boards = inject(BoardService);
  private router = inject(Router);
  public auth = inject(AuthService);
  public theme = inject(ThemeService);

  boardsList = signal<Board[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  showCreate = signal(false);
  newName = signal('');
  creating = signal(false);
  editingId = signal<string | null>(null);
  editName = signal('');
  searchQuery = signal('');
  viewMode = signal<'grid' | 'list'>('grid');
  deleteTarget = signal<Board | null>(null);

  showAuthModal = signal(false);

  filteredBoards = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.boardsList();
    if (!q) return list;
    return list.filter((b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.refresh();
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
        this.error.set(
          'No se pudo conectar con el servidor. Revisa que el backend esté corriendo.'
        );
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  openCreate(): void {
    if (!this.auth.isAuthenticated()) {
      this.showAuthModal.set(true);
      return;
    }
    this.newName.set('');
    this.showCreate.set(true);
  }

  confirmCreate(): void {
    const name = this.newName().trim();
    if (!name || this.creating()) return;
    this.creating.set(true);
    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;
    this.boards
      .create({ name, owner_id: userId })
      .subscribe({
        next: (board) => {
          this.router.navigate(['/board', board.id]);
        },
        error: (err) => {
          this.error.set('No se pudo crear el tablero en el servidor.');
          this.creating.set(false);
          console.error(err);
        },
      });
  }

  continueLocal(): void {
    this.router.navigate(['/board', 'new']);
  }

  onXmiSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    if (!this.auth.isAuthenticated()) {
      this.showAuthModal.set(true);
      input.value = '';
      return;
    }
    const file = input.files[0];
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Modelo XMI';
    const userId = this.auth.currentUser()?.id || `user-${Date.now()}`;

    this.boards.create({ name: baseName, owner_id: userId }).subscribe({
      next: (board) => {
        this.boards.importXmi(board.id, file).subscribe({
          next: () => {
            this.router.navigate(['/board', board.id]);
          },
          error: () => {
            this.router.navigate(['/board', board.id]);
          },
        });
      },
      error: (err) => {
        this.error.set('No se pudo crear el tablero para importar el XMI.');
        console.error(err);
      },
    });
    input.value = '';
  }

  startEdit(b: Board, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.editingId.set(b.id);
    this.editName.set(b.name);
  }
  cancelEdit(): void {
    this.editingId.set(null);
  }
  saveEdit(b: Board): void {
    const name = this.editName().trim();
    if (!name || name === b.name) { this.editingId.set(null); return; }
    this.boards.update(b.id, { name }).subscribe({
      next: (updated) => {
        this.boardsList.update((list) => list.map((x) => x.id === b.id ? updated : x));
        this.editingId.set(null);
      },
      error: (err) => console.error(err),
    });
  }
  deleteBoard(b: Board, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.askDelete(b, ev);
  }
  askDelete(b: Board, ev: MouseEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.deleteTarget.set(b);
  }
  confirmDelete(): void {
    const b = this.deleteTarget();
    if (!b) return;
    this.boards.delete(b.id).subscribe({
      next: () => {
        this.boardsList.update((list) => list.filter((x) => x.id !== b.id));
        this.deleteTarget.set(null);
      },
      error: (err) => console.error(err),
    });
  }

  entityCount(b: Board): number {
    return b.entities_count !== undefined ? b.entities_count : (b.diagram_version ?? 0);
  }

  relationsCount(b: Board): number {
    return b.relations_count ?? 0;
  }

  previewEntities(b: Board): string[] {
    return b.preview_entities || [];
  }

  boardDate(b: Board): string {
    const raw = (b as any).created_at ?? (b as any).updated_at ?? null;
    if (!raw) return b.id.slice(0, 8);
    try {
      const date = new Date(raw);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) return 'Hace unos momentos';
      if (diffHours < 24) return `Hace ${diffHours}h`;
      if (diffDays === 1) return 'Ayer';
      if (diffDays < 7) return `Hace ${diffDays} días`;
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return b.id.slice(0, 8);
    }
  }
}