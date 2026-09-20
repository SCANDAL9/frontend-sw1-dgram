import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-create-board-modal',
  standalone: true,
  imports: [FormsModule, ModalComponent],
  template: `
    <app-modal
      [isOpen]="isOpen()"
      title="Nuevo Tablero de Diseño"
      maxWidth="max-w-md"
      (closed)="onClose()"
    >
      <div class="space-y-5">
        <div class="space-y-1.5">
          <label class="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
            Nombre del Diagrama *
          </label>
          <input
            type="text"
            placeholder="ej. Arquitectura E-Commerce, Microservicios..."
            class="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-zinc-900 dark:focus:border-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white transition-all"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            (keyup.enter)="onSubmit()"
            autofocus
          />
        </div>

        <!-- Import XMI shortcut -->
        <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <input
            type="file"
            #xmiInput
            accept=".xmi,.xml"
            class="hidden"
            (change)="onFileSelected($event)"
          />
          <button
            type="button"
            class="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-xs text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
            (click)="xmiInput.click()"
          >
            <svg class="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>O importar archivo XMI / Enterprise Architect (.xmi, .xml)</span>
          </button>
        </div>

        <!-- Action buttons -->
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
            class="px-5 py-2 rounded-lg text-[12.5px] font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-white disabled:opacity-40 transition-all cursor-pointer shadow-xs active:scale-95"
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
              Crear Tablero
            }
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class CreateBoardModalComponent {
  isOpen = input<boolean>(false);
  creating = input<boolean>(false);

  closed = output<void>();
  create = output<string>();
  importXmi = output<File>();

  name = signal('');

  onSubmit(): void {
    const val = this.name().trim();
    if (!val || this.creating()) return;
    this.create.emit(val);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.importXmi.emit(file);
    input.value = '';
  }

  onClose(): void {
    this.name.set('');
    this.closed.emit();
  }
}
