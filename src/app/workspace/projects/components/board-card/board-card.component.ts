import { Component, input, output, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Board } from '../../../../modeling/diagram/services/board.service';

@Component({
  selector: 'app-board-card',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (viewMode() === 'grid') {
      <!-- GRID VIEW MODE -->
      <div
        class="group relative bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800/90 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer flex flex-col select-none"
        [routerLink]="['/board', board().id]"
      >
        <!-- Blueprint Thumbnail -->
        <div
          class="bg-zinc-100/70 dark:bg-[#080b11] border-b border-zinc-200/60 dark:border-zinc-800/80 flex items-center justify-center relative overflow-hidden group-hover:bg-zinc-100 dark:group-hover:bg-[#0a0e16] transition-colors"
          style="height: 105px; padding: 10px;"
        >
          <div
            class="absolute inset-0 opacity-[0.25] dark:opacity-[0.18] pointer-events-none"
            style="background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: 14px 14px; color: #94a3b8;"
          ></div>

          @let preview = previewEntities();
          @if (preview.length > 0) {
            <div class="relative z-10 flex items-center justify-center -space-x-2 max-w-full overflow-hidden py-0.5">
              @for (name of preview.slice(0, 3); track name; let idx = $index) {
                <div
                  class="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/90 rounded-lg shadow-sm w-[88px] shrink-0 overflow-hidden transform transition-transform group-hover:-translate-y-0.5"
                  [style.z-index]="10 - idx"
                  [style.transform]="idx === 0 ? 'rotate(-2deg)' : (idx === 2 ? 'rotate(2deg)' : 'scale(1.02)')"
                >
                  <div class="px-1.5 py-0.5 bg-zinc-50 dark:bg-zinc-800/90 border-b border-zinc-100 dark:border-zinc-700/80 flex items-center gap-1">
                    <div class="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"></div>
                    <span class="text-[8.5px] font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate" [title]="name">{{ name }}</span>
                  </div>
                  <div class="p-1.5 space-y-1 bg-white/50 dark:bg-zinc-900/40">
                    <div class="flex items-center justify-between gap-1">
                      <div class="h-1 w-8 bg-zinc-300 dark:bg-zinc-700 rounded-full"></div>
                      <div class="h-1 w-3.5 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                    </div>
                    <div class="flex items-center justify-between gap-1">
                      <div class="h-1 w-6 bg-zinc-300 dark:bg-zinc-700 rounded-full"></div>
                      <div class="h-1 w-4 bg-zinc-200 dark:bg-zinc-800 rounded-full"></div>
                    </div>
                  </div>
                </div>
              }
              @if (entityCount() > 3) {
                <div class="relative z-20 shrink-0 ml-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full shadow-xs">
                  +{{ entityCount() - 3 }}
                </div>
              }
            </div>
          } @else {
            <div class="relative z-10 flex flex-col items-center gap-1 text-zinc-400 dark:text-zinc-600">
              <div class="w-7 h-7 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center">
                <svg class="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <span class="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-500">Lienzo en blanco</span>
            </div>
          }
        </div>

        <!-- Info Body -->
        <div class="flex-1 flex flex-col justify-between" style="padding: 14px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div class="flex items-start justify-between gap-2">
              @if (isEditing()) {
                <input
                  type="text"
                  class="flex-1 px-2 py-0.5 bg-white dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded-lg text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 outline-none"
                  [ngModel]="editName()"
                  (ngModelChange)="editNameChange.emit($event)"
                  (click)="$event.stopPropagation()"
                  (keyup.enter)="onSaveEdit()"
                  (keyup.escape)="cancelEdit.emit()"
                  (blur)="onSaveEdit()"
                  autofocus
                />
              } @else {
                <h3
                  class="font-semibold text-[13.5px] text-zinc-900 dark:text-zinc-100 truncate group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors"
                  [title]="board().name"
                >
                  {{ board().name }}
                </h3>
              }

              <!-- Action Buttons -->
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" (click)="$event.stopPropagation()">
                <button
                  type="button"
                  class="w-6.5 h-6.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                  (click)="startEdit.emit({ board: board(), event: $event })"
                  title="Renombrar tablero"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="w-6.5 h-6.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                  (click)="delete.emit({ board: board(), event: $event })"
                  title="Eliminar tablero"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Badges -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center gap-1">
                <svg class="w-3 h-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                <span>{{ entityCount() }} {{ entityCount() === 1 ? 'clase' : 'clases' }}</span>
              </span>
              @if (relationsCount() > 0) {
                <span class="text-[10.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center gap-1">
                  <svg class="w-3 h-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  <span>{{ relationsCount() }} {{ relationsCount() === 1 ? 'relación' : 'relaciones' }}</span>
                </span>
              }
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 font-mono" style="margin-top: 10px; padding-top: 8px;">
            <span>{{ formattedDate() }}</span>
            <span class="truncate" [title]="board().id">{{ board().id.slice(0, 8) }}</span>
          </div>
        </div>
      </div>
    } @else {
      <!-- LIST VIEW MODE -->
      <div
        class="grid grid-cols-12 gap-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group select-none"
        style="padding: 11px 20px;"
        [routerLink]="['/board', board().id]"
      >
        <!-- Col 1: Name & ID -->
        <div class="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            @if (isEditing()) {
              <input
                type="text"
                class="w-full px-2 py-0.5 bg-white dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded-lg text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 outline-none"
                [ngModel]="editName()"
                (ngModelChange)="editNameChange.emit($event)"
                (click)="$event.stopPropagation()"
                (keyup.enter)="onSaveEdit()"
                (keyup.escape)="cancelEdit.emit()"
                (blur)="onSaveEdit()"
                autofocus
              />
            } @else {
              <div class="font-semibold text-[13.5px] text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {{ board().name }}
              </div>
              <div class="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                {{ board().id }}
              </div>
            }
          </div>
        </div>

        <!-- Col 2: Entities / Relations -->
        <div class="col-span-3 sm:col-span-3 flex items-center gap-2">
          <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
            {{ entityCount() }} clases
          </span>
          @if (relationsCount() > 0) {
            <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60 hidden md:inline">
              {{ relationsCount() }} rel
            </span>
          }
        </div>

        <!-- Col 3: Date -->
        <div class="col-span-3 sm:col-span-3 text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
          {{ formattedDate() }}
        </div>

        <!-- Col 4: Quick Actions -->
        <div class="hidden sm:flex sm:col-span-1 items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" (click)="$event.stopPropagation()">
          <button
            type="button"
            class="w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 flex items-center justify-center transition-colors cursor-pointer"
            (click)="startEdit.emit({ board: board(), event: $event })"
            title="Renombrar tablero"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button
            type="button"
            class="w-7 h-7 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
            (click)="delete.emit({ board: board(), event: $event })"
            title="Eliminar tablero"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    }
  `,
})
export class BoardCardComponent {
  board = input.required<Board>();
  viewMode = input<'grid' | 'list'>('grid');
  isEditing = input<boolean>(false);
  editName = input<string>('');

  startEdit = output<{ board: Board; event: MouseEvent }>();
  cancelEdit = output<void>();
  saveEdit = output<{ board: Board; name: string }>();
  delete = output<{ board: Board; event: MouseEvent }>();
  editNameChange = output<string>();

  entityCount = computed(() => {
    const b = this.board();
    return b.entities_count !== undefined ? b.entities_count : (b.diagram_version ?? 0);
  });

  relationsCount = computed(() => this.board().relations_count ?? 0);

  previewEntities = computed(() => this.board().preview_entities || []);

  formattedDate = computed(() => {
    const b = this.board();
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
  });

  onSaveEdit(): void {
    this.saveEdit.emit({ board: this.board(), name: this.editName() });
  }
}
