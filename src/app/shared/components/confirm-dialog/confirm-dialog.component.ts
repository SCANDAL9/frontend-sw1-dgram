import { Component, input, output } from '@angular/core';
import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal
      [isOpen]="isOpen()"
      [title]="title()"
      maxWidth="max-w-md"
      (closed)="onCancel()"
    >
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground leading-relaxed">
          {{ message() }}
        </p>

        <div class="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-xl text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border transition-all cursor-pointer active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none shadow-2xs"
            (click)="onCancel()"
            [disabled]="loading()"
          >
            {{ cancelText() }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs disabled:opacity-50 hover:opacity-90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            [class.bg-destructive]="danger()"
            [class.text-destructive-foreground]="danger()"
            [class.bg-primary]="!danger()"
            [class.text-primary-foreground]="!danger()"
            (click)="onConfirm()"
            [disabled]="loading()"
          >
            @if (loading()) {
              <span class="inline-flex items-center gap-1.5">
                <svg class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </span>
            } @else {
              {{ confirmText() }}
            }
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class ConfirmDialogComponent {
  isOpen = input<boolean>(false);
  title = input<string>('Confirmar acción');
  message = input<string>('');
  confirmText = input<string>('Confirmar');
  cancelText = input<string>('Cancelar');
  danger = input<boolean>(true);
  loading = input<boolean>(false);

  confirmed = output<void>();
  cancelled = output<void>();

  onConfirm(): void {
    if (!this.loading()) {
      this.confirmed.emit();
    }
  }

  onCancel(): void {
    if (!this.loading()) {
      this.cancelled.emit();
    }
  }
}
