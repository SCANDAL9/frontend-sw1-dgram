import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

export interface ProactiveHint {
  id: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionType?: 'create_class' | 'open_chat' | 'dismiss';
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ProactivityService {
  private toast = inject(ToastService);

  // Throttle / Cooldown: mínimo 60 segundos entre intervenciones automáticas
  private readonly COOLDOWN_MS = 60_000;
  private lastInterventionTime = 0;
  private consecutiveErrors = 0;
  private emptyBoardPrompted = false;

  readonly activeHint = signal<ProactiveHint | null>(null);

  /**
   * Evalúa si ha transcurrido el tiempo mínimo de cooldown (60s).
   */
  canTriggerProactive(): boolean {
    return Date.now() - this.lastInterventionTime >= this.COOLDOWN_MS;
  }

  /**
   * Regla 1: Primer Tablero.
   * Si el lienzo tiene 0 clases al iniciar, muestra una sugerencia sutil no invasiva.
   */
  checkEmptyBoard(entityCount: number): void {
    if (entityCount === 0 && !this.emptyBoardPrompted && this.canTriggerProactive()) {
      this.emptyBoardPrompted = true;
      this.triggerHint({
        id: 'empty-board-welcome',
        title: 'Lienzo listo para modelar',
        message: 'Puedes crear clases con la tecla C, presionar + en la barra, dictar por voz o subir una foto de pizarra.',
        actionLabel: 'Crear primera clase',
        actionType: 'create_class',
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Regla 2: Error Reiterado.
   * Si 2 operaciones fallan consecutivamente, ofrece asistencia de arquitectura del GuideAgent.
   */
  recordOperationError(reason?: string): void {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= 2 && this.canTriggerProactive()) {
      this.consecutiveErrors = 0;
      this.triggerHint({
        id: 'repeated-error-assistance',
        title: '¿Necesitas ayuda con el modelado?',
        message: reason
          ? `Detecté dificultades reiteradas (${reason}). Puedes consultar al Guide Agent o revisar las reglas del proyecto.`
          : 'Detecté varias operaciones fallidas consecutivas. El Guide Agent puede ayudarte a normalizar tus entidades.',
        actionLabel: 'Consultar Guide Agent',
        actionType: 'open_chat',
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Resetea el contador de errores ante una operación exitosa.
   */
  recordOperationSuccess(): void {
    this.consecutiveErrors = 0;
  }

  /**
   * Lanza una sugerencia proactiva respetando el cooldown.
   */
  private triggerHint(hint: ProactiveHint): void {
    this.lastInterventionTime = Date.now();
    this.activeHint.set(hint);
  }

  /**
   * Descarta la sugerencia proactiva activa.
   */
  dismissHint(): void {
    this.activeHint.set(null);
  }
}
