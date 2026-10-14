import { Injectable, inject, signal } from '@angular/core';
import { AiChatService } from './ai-chat.service';
import { ToastService } from '../../../core/services/toast.service';
import { ChatConversationSession, ChatMsg } from '../models/ai-chat.models';

@Injectable({ providedIn: 'root' })
export class StudioChatSessionService {
  private aiChat = inject(AiChatService);
  private toast = inject(ToastService);

  readonly conversations = signal<ChatConversationSession[]>([]);
  readonly activeConversationId = signal<string | null>(null);
  readonly messages = signal<ChatMsg[]>([]);
  readonly aiLoading = signal<boolean>(false);
  readonly aiStatus = signal<string>('Generando respuesta...');

  loadConversations(boardId: string, selectLatest: boolean = false, onLoaded?: () => void): void {
    this.aiChat.getConversations(boardId).subscribe({
      next: (convs) => {
        this.conversations.set(convs || []);
        if (convs && convs.length > 0) {
          const currentId = this.activeConversationId();
          const exists = currentId && convs.some((c) => c.id === currentId);
          if (!exists || selectLatest) {
            this.activeConversationId.set(convs[0].id);
            this.loadChatHistory(boardId, convs[0].id, onLoaded);
            return;
          }
        } else {
          this.startNewChat(boardId, onLoaded);
          return;
        }
        if (onLoaded) onLoaded();
      },
      error: () => {},
    });
  }

  startNewChat(boardId: string, onLoaded?: () => void): void {
    this.aiChat.createConversation(boardId, 'Nuevo Chat').subscribe({
      next: (conv) => {
        this.conversations.update((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
        this.activeConversationId.set(conv.id);
        this.messages.set([]);
        if (onLoaded) onLoaded();
      },
      error: () => {
        this.toast.error('No se pudo iniciar un nuevo chat.');
      },
    });
  }

  switchConversation(boardId: string, conversationId: string, onLoaded?: () => void): void {
    if (this.activeConversationId() === conversationId) return;
    this.activeConversationId.set(conversationId);
    this.loadChatHistory(boardId, conversationId, onLoaded);
  }

  deleteActiveConversation(boardId: string, onLoaded?: () => void): void {
    const currentId = this.activeConversationId();
    if (!currentId) return;

    this.aiChat.deleteConversation(boardId, currentId).subscribe({
      next: () => {
        const remaining = this.conversations().filter((c) => c.id !== currentId);
        this.conversations.set(remaining);
        if (remaining.length > 0) {
          this.activeConversationId.set(remaining[0].id);
          this.loadChatHistory(boardId, remaining[0].id, onLoaded);
        } else {
          this.startNewChat(boardId, onLoaded);
        }
        this.toast.info('Conversación eliminada.');
      },
      error: () => {
        this.toast.error('No se pudo eliminar la conversación.');
      },
    });
  }

  loadChatHistory(boardId: string, conversationId?: string, onLoaded?: () => void): void {
    const targetId = conversationId || this.activeConversationId() || undefined;
    this.aiChat.getHistory(boardId, targetId).subscribe({
      next: (msgs) => {
        this.messages.set(msgs || []);
        if (onLoaded) onLoaded();
      },
      error: () => {},
    });
  }

  addMessage(msg: ChatMsg): void {
    this.messages.update((prev) => [...prev, msg]);
  }

  setActiveConversationId(id: string | null): void {
    this.activeConversationId.set(id);
  }

  setAiStatus(status: string): void {
    this.aiStatus.set(status);
  }

  setAiLoading(loading: boolean): void {
    this.aiLoading.set(loading);
  }
}
