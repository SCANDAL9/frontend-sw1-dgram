import { Component, input, output, HostListener } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
        role="dialog"
        [attr.aria-label]="title()"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
          (click)="onBackdropClick()"
        ></div>

        <!-- Dialog Box -->
        <div
          class="relative w-full {{ maxWidth() }} bg-card text-card-foreground rounded-3xl border border-border/80 shadow-2xl z-10 overflow-hidden ring-1 ring-border/50 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        >
          <!-- Header -->
          @if (title()) {
            <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-card/60 backdrop-blur-md shrink-0">
              <h3 class="text-base font-semibold text-foreground tracking-tight">
                {{ title() }}
              </h3>
              <button
                type="button"
                class="size-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-border transition-all cursor-pointer active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                (click)="close()"
                title="Cerrar (Esc)"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          }

          <!-- Content Slot -->
          <div class="p-6 overflow-y-auto">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  isOpen = input<boolean>(false);
  title = input<string>('');
  maxWidth = input<string>('max-w-md');
  closeOnBackdrop = input<boolean>(true);

  closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close();
    }
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
