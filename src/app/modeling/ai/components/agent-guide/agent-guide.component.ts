import {
  Component,
  Input,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentGuideService, InspectionTarget } from '../../services/agent-guide.service';
import { OnboardingService } from '../../services/onboarding.service';

@Component({
  selector: 'app-agent-guide',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'block' },
  templateUrl: './agent-guide.component.html',
})
export class AgentGuideComponent implements OnDestroy {
  @Input({ required: true }) boardId!: string;

  guide = inject(AgentGuideService);
  onboarding = inject(OnboardingService);

  @ViewChild('bubbleEl') bubbleEl?: ElementRef<HTMLElement>;

  isDragging = signal<boolean>(false);
  highlightedTargetName = signal<string | null>(null);
  customQuestion = '';

  private currentHoveredEl: Element | null = null;
  private dragStartPos = { x: 0, y: 0 };
  private bubbleStartPos = { x: 0, y: 0 };
  private hasMoved = false;

  // Offset dinámico del panel para que no se salga de la pantalla
  readonly panelOffset = computed(() => {
    const pos = this.guide.bubblePos();
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Si la burbuja está muy a la derecha, desplegar panel a la izquierda
    const left = pos.x + 64 > windowWidth - 380 ? -370 : 64;
    // Si la burbuja está muy abajo, desplegar panel hacia arriba
    const top = pos.y > windowHeight - 400 ? -320 : 0;

    return { left, top };
  });

  // Título mostrado según modo (tour vs inspección)
  readonly displayedTitle = computed(() => {
    const res = this.guide.currentResponse();
    if (res) return res.title;
    if (this.onboarding.isActive()) {
      return this.onboarding.currentStep()?.title || 'Tour de Inicio';
    }
    return 'Spatial AI Guide';
  });

  readonly displayedExplanation = computed(() => {
    const res = this.guide.currentResponse();
    if (res) return res.explanation;
    if (this.onboarding.isActive()) {
      return this.onboarding.currentStep()?.description || '';
    }
    return 'Arrastra esta burbuja y suéltala sobre cualquier clase, relación o botón para obtener explicaciones guiadas.';
  });

  readonly displayedTip = computed(() => {
    const res = this.guide.currentResponse();
    if (res?.tip) return res.tip;
    return undefined;
  });

  readonly displayedNextStep = computed(() => {
    const res = this.guide.currentResponse();
    if (res?.nextStep) return res.nextStep;
    if (this.onboarding.isActive()) {
      const step = this.onboarding.currentStep();
      return step ? { label: step.title, actionHint: step.actionHint || '' } : undefined;
    }
    return undefined;
  });

  readonly displayedFollowups = computed(() => {
    const res = this.guide.currentResponse();
    if (res?.followups) return res.followups;
    return [
      '¿Cómo diseño un buen diagrama UML?',
      '¿Cómo relaciono dos tablas en dgram?',
      '¿Qué atajos de teclado existen?',
    ];
  });

  onPointerDown(event: PointerEvent): void {
    // Solo clic primario
    if (event.button !== 0) return;

    this.isDragging.set(true);
    this.hasMoved = false;
    this.dragStartPos = { x: event.clientX, y: event.clientY };
    this.bubbleStartPos = { ...this.guide.bubblePos() };

    (event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;

    const deltaX = event.clientX - this.dragStartPos.x;
    const deltaY = event.clientY - this.dragStartPos.y;

    if (Math.hypot(deltaX, deltaY) > 5) {
      this.hasMoved = true;
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const newX = Math.max(10, Math.min(windowWidth - 70, this.bubbleStartPos.x + deltaX));
    const newY = Math.max(10, Math.min(windowHeight - 70, this.bubbleStartPos.y + deltaY));

    this.guide.savePosition({ x: newX, y: newY });

    // Detectar elemento bajo el cursor
    this.detectElementUnderCursor(event.clientX, event.clientY);
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;

    this.isDragging.set(false);
    this.clearHoverHighlight();

    if (!this.hasMoved) {
      // Fue un clic simple -> alternar panel
      if (this.guide.isPanelOpen()) {
        this.guide.closePanel();
      } else {
        this.guide.isPanelOpen.set(true);
      }
      return;
    }

    // Fue un arrastre: si cayó sobre un target válido, inspeccionarlo
    if (this.currentHoveredEl) {
      const targetType = this.currentHoveredEl.getAttribute('data-agent-target');
      if (targetType) {
        const entityId = this.currentHoveredEl.getAttribute('data-agent-entity-id') || undefined;
        const entityName = this.currentHoveredEl.getAttribute('data-agent-name') || undefined;
        const meta: Record<string, any> = {
          name: entityName,
          id: entityId,
        };
        this.guide.inspectTarget(this.boardId, {
          type: targetType,
          meta,
          rawElement: this.currentHoveredEl,
        });
      }
      this.currentHoveredEl = null;
    }
  }

  private detectElementUnderCursor(x: number, y: number): void {
    // Ocultar temporalmente la burbuja del hit-test para leer el elemento debajo
    if (this.bubbleEl) {
      this.bubbleEl.nativeElement.style.pointerEvents = 'none';
    }
    const elem = document.elementFromPoint(x, y);
    if (this.bubbleEl) {
      this.bubbleEl.nativeElement.style.pointerEvents = '';
    }

    if (!elem) {
      this.clearHoverHighlight();
      return;
    }

    const targetEl = elem.closest('[data-agent-target]');
    if (targetEl && targetEl !== this.currentHoveredEl) {
      this.clearHoverHighlight();
      this.currentHoveredEl = targetEl;
      this.applyHoverHighlight(targetEl);
    } else if (!targetEl && this.currentHoveredEl) {
      this.clearHoverHighlight();
    }
  }

  private applyHoverHighlight(el: Element): void {
    (el as HTMLElement).style.outline = '3px solid #6366f1';
    (el as HTMLElement).style.outlineOffset = '2px';
    (el as HTMLElement).style.transition = 'outline 0.15s ease';

    const label = el.getAttribute('data-agent-name') || el.getAttribute('data-agent-target') || 'Elemento';
    this.highlightedTargetName.set(`Soltar sobre: ${label}`);
  }

  private clearHoverHighlight(): void {
    if (this.currentHoveredEl) {
      (this.currentHoveredEl as HTMLElement).style.outline = '';
      (this.currentHoveredEl as HTMLElement).style.outlineOffset = '';
      this.currentHoveredEl = null;
    }
    this.highlightedTargetName.set(null);
  }

  askFollowup(q: string): void {
    this.guide.askQuestion(this.boardId, q);
  }

  submitQuestion(event: Event): void {
    event.preventDefault();
    if (!this.customQuestion.trim()) return;
    const q = this.customQuestion;
    this.customQuestion = '';
    this.guide.askQuestion(this.boardId, q);
  }

  ngOnDestroy(): void {
    this.clearHoverHighlight();
  }
}
