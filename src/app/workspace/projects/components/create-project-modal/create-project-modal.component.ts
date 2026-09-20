import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-create-project-modal',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  template: `
    <app-modal
      [isOpen]="isOpen()"
      title="Crear Nuevo Proyecto"
      maxWidth="max-w-md"
      (closed)="onClose()"
    >
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
            Nombre del Proyecto *
          </label>
          <input
            type="text"
            placeholder="ej. Sistema Bancario Core, API E-commerce..."
            class="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            autofocus
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
            Descripción (opcional)
          </label>
          <textarea
            placeholder="Breve propósito o alcance del proyecto..."
            rows="3"
            class="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            [ngModel]="description()"
            (ngModelChange)="description.set($event)"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-[12.5px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            (click)="onClose()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="px-5 py-2 rounded-lg text-[12.5px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-all cursor-pointer shadow-xs active:scale-95"
            [disabled]="creating() || !name().trim()"
            (click)="onSubmit()"
          >
            @if (creating()) {
              <span class="inline-flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creando...
              </span>
            } @else {
              Crear Proyecto
            }
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class CreateProjectModalComponent {
  isOpen = input<boolean>(false);
  creating = input<boolean>(false);

  closed = output<void>();
  create = output<{ name: string; description: string | null }>();

  name = signal('');
  description = signal('');

  onSubmit(): void {
    const val = this.name().trim();
    if (!val || this.creating()) return;
    this.create.emit({
      name: val,
      description: this.description().trim() || null,
    });
  }

  onClose(): void {
    this.name.set('');
    this.description.set('');
    this.closed.emit();
  }
}
