import { Injectable, inject, signal } from '@angular/core';
import { DiagramService } from '../../diagram/services/diagram.service';
import { WebsocketService } from '../../diagram/services/websocket.service';
import { PendingConfirmation } from '../models/ai-chat.models';

export interface CommandExecutionResult {
  replyText: string;
  commands: any[];
  isPending: boolean;
}

@Injectable({ providedIn: 'root' })
export class StudioCommandExecutorService {
  private diagram = inject(DiagramService);
  private ws = inject(WebsocketService);

  readonly pendingConfirmation = signal<PendingConfirmation | null>(null);

  handleAiResponse(res: any, isVision: boolean = false): CommandExecutionResult {
    const replyText = res.reply || 'Comandos aplicados al diagrama.';
    const commands: any[] = res.commands || [];

    if (isVision && commands.length > 0) {
      const classNames = commands
        .filter((c) => (c.command_type === 'CREATE_ENTITY' || c.command_type === 'CREATE_CLASS') && c.payload?.name)
        .map((c) => c.payload.name);

      const desc =
        classNames.length > 0
          ? `Se detectaron ${classNames.length} entidad(es) en el boceto (${classNames.join(', ')}). ¿Deseas aplicarlas al lienzo?`
          : `Se detectaron ${commands.length} cambio(s) a partir del boceto. ¿Deseas aplicarlos al lienzo?`;

      this.pendingConfirmation.set({
        title: 'Previsualización Vision OCR',
        description: desc,
        commands,
        isVision: true,
        detectedEntities: classNames,
      });

      return {
        replyText: replyText + '\n\n*(Boceto analizado. Revisa la previsualización antes de aplicar al diagrama)*',
        commands,
        isPending: true,
      };
    }

    const isDestructive = commands.some(
      (cmd) =>
        cmd.command_type === 'DELETE_ENTITY' ||
        cmd.command_type === 'DELETE_CLASS' ||
        cmd.command_type === 'DELETE_COLUMN' ||
        cmd.command_type === 'DELETE_ATTRIBUTE' ||
        cmd.command_type === 'DELETE_RELATION' ||
        cmd.command_type === 'DELETE_ASSOCIATION'
    );

    if (isDestructive) {
      const desc =
        commands.length === 1
          ? `Se solicita una acción destructiva (${commands[0].command_type}). ¿Deseas aplicarla?`
          : `Se solicitan ${commands.length} acciones que incluyen eliminaciones en el diagrama. ¿Deseas aplicarlas?`;

      this.pendingConfirmation.set({
        title: 'Confirmación requerida',
        description: desc,
        commands,
        isVision: false,
      });

      return {
        replyText: replyText + '\n\n*(Acción en pausa esperando tu confirmación)*',
        commands,
        isPending: true,
      };
    }

    this.executeCommandsDirectly(commands);
    return {
      replyText,
      commands,
      isPending: false,
    };
  }

  applyPendingCommands(): { commands: any[]; replyText: string } | null {
    const pending = this.pendingConfirmation();
    if (!pending) return null;
    const wasVision = pending.isVision;
    const commands = pending.commands;
    this.pendingConfirmation.set(null);
    const replyText = wasVision
      ? 'Boceto aprobado y generado en el diagrama.'
      : 'Cambios confirmados y aplicados al diagrama.';
    this.executeCommandsDirectly(commands);
    return { commands, replyText };
  }

  cancelPendingCommands(): { wasVision: boolean } | null {
    const pending = this.pendingConfirmation();
    if (!pending) return null;
    const wasVision = !!pending.isVision;
    this.pendingConfirmation.set(null);
    return { wasVision };
  }

  executeCommandsDirectly(commands: any[]): void {
    for (const cmd of commands) {
      const payload = { ...(cmd.payload || {}) };
      if (
        (cmd.command_type === 'CREATE_ENTITY' || cmd.command_type === 'CREATE_CLASS') &&
        !payload.entity_id &&
        !payload.class_id
      ) {
        const generatedId = `ent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        payload.entity_id = generatedId;
        payload.class_id = generatedId;
      }

      const fullCmd = {
        command_id: cmd.command_id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        command_type: cmd.command_type,
        payload,
        actor: 'ai:copilot',
        timestamp: new Date().toISOString(),
        model_version: this.diagram.version() + 1,
      };

      this.diagram.applyCommand(fullCmd);
      this.ws.markApplied(fullCmd.command_id);
      this.ws.send({ type: 'command:send', data: fullCmd });
    }
  }
}
