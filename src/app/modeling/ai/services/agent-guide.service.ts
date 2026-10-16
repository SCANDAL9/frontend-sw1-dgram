import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AGENT_TARGET_CATALOG, AgentTargetDef } from './agent-target.registry';

export interface GuideResponse {
  title: string;
  explanation: string;
  tip?: string;
  nextStep?: {
    label: string;
    actionHint: string;
  };
  followups: string[];
}

export interface InspectionTarget {
  type: string;
  meta: Record<string, any>;
  rawElement?: Element;
}

@Injectable({ providedIn: 'root' })
export class AgentGuideService {
  private http = inject(HttpClient);

  // Posición de la burbuja (pantalla completa, fixed)
  readonly bubblePos = signal<{ x: number; y: number }>(this.getInitialPosition());
  readonly isMinimized = signal<boolean>(false);
  readonly isPanelOpen = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly currentTarget = signal<InspectionTarget | null>(null);
  readonly currentResponse = signal<GuideResponse | null>(null);

  private sessionToken = this.getOrCreateSessionToken();

  private getInitialPosition(): { x: number; y: number } {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    try {
      const saved = localStorage.getItem('dgram_guide_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const safeX = parsed.x > winW - 360 ? Math.max(80, winW - 420) : parsed.x;
          return { x: safeX, y: parsed.y };
        }
      }
    } catch {
      // ignore
    }
    // Posición predeterminada: a la izquierda del inspector (340px)
    const x = Math.max(80, winW - 420);
    const y = Math.max(80, winH - 90);
    return { x, y };
  }

  savePosition(pos: { x: number; y: number }): void {
    this.bubblePos.set(pos);
    try {
      localStorage.setItem('dgram_guide_pos', JSON.stringify(pos));
    } catch {
      // ignore
    }
  }

  private getOrCreateSessionToken(): string {
    try {
      const existing = localStorage.getItem('dgram_guide_token');
      if (existing) return existing;
      const newToken = 'gt_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('dgram_guide_token', newToken);
      return newToken;
    } catch {
      return 'gt_guest_' + Date.now();
    }
  }

  async inspectTarget(boardId: string, target: InspectionTarget): Promise<void> {
    this.currentTarget.set(target);
    this.isPanelOpen.set(true);

    // 1. Revisar si coincide con catálogo estático inmediato
    const staticDef = AGENT_TARGET_CATALOG[target.type];
    if (staticDef && !this.isDynamicTarget(target.type)) {
      this.currentResponse.set({
        title: staticDef.title,
        explanation: staticDef.explanation,
        tip: staticDef.tip,
        nextStep: staticDef.nextStep,
        followups: staticDef.followups,
      });
      return;
    }

    // 2. Target dinámico (ej. una clase o relación creada en el canvas) -> Consultar Asistente IA Guide
    this.isLoading.set(true);
    try {
      const payload = {
        target_type: target.type,
        target_meta: target.meta,
        session_token: this.sessionToken,
      };
      const res = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrl}/guide/boards/${boardId}/explain`, payload)
      );
      this.currentResponse.set({
        title: res.title || 'Guía de Elemento',
        explanation: res.explanation || 'No se pudo generar explicación detallada.',
        tip: res.tip,
        nextStep: res.next_step ? {
          label: res.next_step.label,
          actionHint: res.next_step.action_hint,
        } : undefined,
        followups: res.followups || [],
      });
    } catch (err) {
      // Fallback elegante sin romper la experiencia
      this.currentResponse.set({
        title: target.meta?.['name'] ? `Elemento: ${target.meta['name']}` : 'Elemento del Diagrama',
        explanation: 'Elemento activo en el lienzo UML. Puedes interactuar con él, editar sus propiedades o conectar con otras entidades.',
        tip: 'Tip: Usa las teclas rápidas o el menú contextual para acciones avanzadas.',
        followups: ['¿Cómo optimizar este diagrama?', '¿Cómo exportarlo?'],
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async askQuestion(boardId: string, question: string): Promise<void> {
    if (!question.trim()) return;

    this.isLoading.set(true);
    try {
      const payload = {
        question: question.trim(),
        target_context: this.currentTarget()
          ? {
              target_type: this.currentTarget()!.type,
              target_meta: this.currentTarget()!.meta,
            }
          : null,
        session_token: this.sessionToken,
      };
      const res = await firstValueFrom(
        this.http.post<any>(`${environment.apiUrl}/guide/boards/${boardId}/ask`, payload)
      );
      this.currentResponse.set({
        title: res.title || 'Respuesta del Asistente',
        explanation: res.explanation || 'Respuesta completada.',
        tip: res.tip,
        nextStep: res.next_step ? {
          label: res.next_step.label,
          actionHint: res.next_step.action_hint,
        } : undefined,
        followups: res.followups || [],
      });
    } catch {
      // Fallback
    } finally {
      this.isLoading.set(false);
    }
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
  }

  toggleMinimized(): void {
    this.isMinimized.update((v) => !v);
  }

  private isDynamicTarget(targetType: string): boolean {
    return (
      targetType.startsWith('entity:') ||
      targetType.startsWith('relation:') ||
      targetType.startsWith('attribute:') ||
      targetType === 'entity' ||
      targetType === 'relation' ||
      targetType === 'attribute'
    );
  }
}
