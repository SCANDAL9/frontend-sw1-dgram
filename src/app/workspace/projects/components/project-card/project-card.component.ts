import { Component, input, output, computed } from '@angular/core';
import { Project } from '../../models/project.models';

@Component({
  selector: 'app-project-card',
  standalone: true,
  template: `
    <div
      class="bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-xs hover:shadow-md group"
    >
      <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div
              class="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div class="min-w-0">
              <h3
                class="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate"
                [title]="project().name"
              >
                {{ project().name }}
              </h3>
              <span class="text-[10.5px] text-zinc-400 font-mono">{{ formattedDate() }}</span>
            </div>
          </div>

          <span
            class="text-[10.5px] font-semibold px-2 py-0.5 rounded-md border shrink-0"
            [class]="
              isOwner()
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60'
            "
          >
            {{ roleLabel() }}
          </span>
        </div>

        <p class="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 min-h-[32px]">
          {{ project().description || 'Sin descripción adicional para este proyecto.' }}
        </p>
      </div>

      <div class="flex items-center justify-between pt-4 mt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
          (click)="createBoard.emit({ project: project(), event: $event })"
          title="Crear un nuevo diagrama dentro de este proyecto"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Nuevo Diagrama</span>
        </button>

        @if (isOwner()) {
          <button
            type="button"
            class="w-7 h-7 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
            (click)="delete.emit({ project: project(), event: $event })"
            title="Eliminar proyecto"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        }
      </div>
    </div>
  `,
})
export class ProjectCardComponent {
  project = input.required<Project>();

  createBoard = output<{ project: Project; event: MouseEvent }>();
  delete = output<{ project: Project; event: MouseEvent }>();

  isOwner = computed(() => this.project().my_role === 'owner');

  roleLabel = computed(() => {
    const p = this.project();
    if (p.my_role === 'owner') return 'Propietario';
    return p.my_role || 'Colaborador';
  });

  formattedDate = computed(() => {
    const p = this.project();
    const raw = p.created_at ?? p.updated_at ?? null;
    if (!raw) return p.id.slice(0, 8);
    try {
      const date = new Date(raw);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return p.id.slice(0, 8);
    }
  });
}
