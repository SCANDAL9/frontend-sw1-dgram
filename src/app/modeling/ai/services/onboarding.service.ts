import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommandService } from '../../diagram/services/command.service';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetKey: string | null;
  actionRequired?: string | null;
  actionHint?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '¡Bienvenido a dgram!',
    description: 'dgram es tu entorno de diseño de arquitectura UML y modelado relacional colaborativo. Esta burbuja es tu guía interactiva.',
    targetKey: 'canvas:empty',
    actionHint: 'Haz clic en siguiente para iniciar el tour guiado.',
  },
  {
    id: 'create_first_entity',
    title: 'Crea tu primera clase',
    description: 'Comienza añadiendo una clase al diagrama. Presiona el botón + en la barra superior o presiona la tecla C.',
    targetKey: 'toolbar:create-entity',
    actionRequired: 'CREATE_ENTITY',
    actionHint: 'Crea una clase en el lienzo para avanzar automáticamente.',
  },
  {
    id: 'add_attribute',
    title: 'Define atributos y tipos',
    description: 'Haz doble clic sobre una clase o haz clic en "+ Atributo" para definir campos con tipos SQL/UML y claves primarias.',
    targetKey: 'entity:node',
    actionRequired: 'ADD_COLUMN',
    actionHint: 'Añade un atributo a tu clase.',
  },
  {
    id: 'create_relation',
    title: 'Conecta con asociaciones',
    description: 'Pasa el cursor sobre el borde de una clase para desplegar el conector rápido y vincúlala con otra clase.',
    targetKey: 'toolbar:create-relation',
    actionRequired: 'CREATE_RELATION',
    actionHint: 'Crea una relación entre dos entidades.',
  },
  {
    id: 'explore_ai',
    title: 'Potencia con Asistente IA',
    description: 'El chat de IA y OCR por visión te permiten generar estructuras completas o digitalizar bocetos de pizarras en segundos.',
    targetKey: 'toolbar:open-studio',
    actionHint: 'Prueba la IA o finaliza el tour cuando desees.',
  },
  {
    id: 'completed',
    title: '¡Todo listo para construir!',
    description: 'Has dominado los aspectos esenciales. Puedes arrastrar esta burbuja sobre cualquier elemento cuando tengas dudas de arquitectura.',
    targetKey: null,
  },
];

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private http = inject(HttpClient);
  private cmdService = inject(CommandService);

  readonly steps = ONBOARDING_STEPS;
  readonly currentStepIndex = signal<number>(0);
  readonly isActive = signal<boolean>(true);
  readonly completedStepIds = signal<Set<string>>(new Set());

  readonly currentStep = computed(() => this.steps[this.currentStepIndex()]);
  readonly isLastStep = computed(() => this.currentStepIndex() === this.steps.length - 1);
  readonly progressPercent = computed(() =>
    Math.round(((this.currentStepIndex() + 1) / this.steps.length) * 100)
  );

  constructor() {
    this.loadInitialProgress();

    // Reaccionar a comandos del usuario para auto-avanzar los pasos del tour
    effect(() => {
      // Leemos el historial de comandos
      const current = this.currentStep();
      if (!current?.actionRequired) return;

      const history = this.cmdService.exportHistory();
      if (history.length === 0) return;

      const lastCmd = history[history.length - 1];
      const cmdType = lastCmd.command_type;

      if (
        (current.actionRequired === 'CREATE_ENTITY' && (cmdType === 'CREATE_ENTITY' || (cmdType as string) === 'CREATE_CLASS')) ||
        (current.actionRequired === 'ADD_COLUMN' && (cmdType === 'ADD_COLUMN' || (cmdType as string) === 'ADD_ATTRIBUTE')) ||
        (current.actionRequired === 'CREATE_RELATION' && (cmdType === 'CREATE_RELATION' || (cmdType as string) === 'CREATE_ASSOCIATION'))
      ) {
        this.completeCurrentStep();
      }
    });
  }

  private loadInitialProgress(): void {
    try {
      const saved = localStorage.getItem('dgram_onboarding_progress');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.index !== undefined) {
          this.currentStepIndex.set(Math.min(data.index, this.steps.length - 1));
        }
        if (Array.isArray(data.completed)) {
          this.completedStepIds.set(new Set(data.completed));
        }
        if (data.isActive !== undefined) {
          this.isActive.set(data.isActive);
        }
      }
    } catch {
      // Ignorar fallo de parseo
    }
  }

  private saveProgress(): void {
    try {
      localStorage.setItem(
        'dgram_onboarding_progress',
        JSON.stringify({
          index: this.currentStepIndex(),
          completed: Array.from(this.completedStepIds()),
          isActive: this.isActive(),
        })
      );
    } catch {
      // Ignorar localStorage deshabilitado
    }
  }

  completeCurrentStep(): void {
    const current = this.currentStep();
    if (!current) return;

    const nextSet = new Set(this.completedStepIds());
    nextSet.add(current.id);
    this.completedStepIds.set(nextSet);

    if (this.currentStepIndex() < this.steps.length - 1) {
      this.currentStepIndex.update((i) => i + 1);
    }
    this.saveProgress();
  }

  goToStep(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.currentStepIndex.set(index);
      this.saveProgress();
    }
  }

  dismissTour(): void {
    this.isActive.set(false);
    this.saveProgress();
  }

  restartTour(): void {
    this.currentStepIndex.set(0);
    this.completedStepIds.set(new Set());
    this.isActive.set(true);
    this.saveProgress();
  }
}
