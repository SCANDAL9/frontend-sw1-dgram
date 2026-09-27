import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ChatMsg, AiCommandResponse, ChatConversationSession } from '../models/ai-chat.models';
import { AiChatAdapter, ChatMsgDto, AiCommandResponseDto } from '../adapters/ai-chat.adapter';

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private http = inject(HttpClient);

  getConversations(boardId: string): Observable<ChatConversationSession[]> {
    return this.http.get<ChatConversationSession[]>(
      `${environment.apiUrl}/chat/boards/${boardId}/conversations`
    );
  }

  createConversation(boardId: string, title?: string): Observable<ChatConversationSession> {
    return this.http.post<ChatConversationSession>(
      `${environment.apiUrl}/chat/boards/${boardId}/conversations`,
      { title }
    );
  }

  deleteConversation(boardId: string, conversationId: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/chat/boards/${boardId}/conversations/${conversationId}`
    );
  }

  getHistory(boardId: string, conversationId?: string): Observable<ChatMsg[]> {
    const url = conversationId
      ? `${environment.apiUrl}/chat/boards/${boardId}/messages?conversation_id=${encodeURIComponent(conversationId)}`
      : `${environment.apiUrl}/chat/boards/${boardId}/messages`;
    return this.http
      .get<ChatMsgDto[]>(url)
      .pipe(map((dtos) => AiChatAdapter.toChatMsgList(dtos)));
  }

  sendMessage(
    boardId: string,
    text: string,
    userId?: string,
    conversationId?: string
  ): Observable<AiCommandResponse & { conversation_id?: string }> {
    return this.http
      .post<AiCommandResponseDto & { conversation_id?: string }>(
        `${environment.apiUrl}/chat/boards/${boardId}/message`,
        {
          text,
          user_id: userId,
          conversation_id: conversationId,
        }
      )
      .pipe(
        map((dto) => ({
          ...AiChatAdapter.toAiCommandResponse(dto),
          conversation_id: dto.conversation_id,
        }))
      );
  }

  sendVision(
    boardId: string,
    image: File,
    prompt?: string,
    userId?: string,
    conversationId?: string
  ): Observable<AiCommandResponse> {
    const formData = new FormData();
    formData.append('file', image);
    if (prompt) {
      formData.append('prompt', prompt);
    }
    if (userId) {
      formData.append('user_id', userId);
    }
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }
    return this.http
      .post<AiCommandResponseDto>(`${environment.apiUrl}/chat/boards/${boardId}/vision`, formData)
      .pipe(map((dto) => AiChatAdapter.toAiCommandResponse(dto)));
  }

  sendAudio(
    boardId: string,
    audio: File,
    prompt?: string,
    userId?: string,
    conversationId?: string
  ): Observable<AiCommandResponse> {
    const formData = new FormData();
    formData.append('file', audio);
    if (prompt) {
      formData.append('prompt', prompt);
    }
    if (userId) {
      formData.append('user_id', userId);
    }
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }
    return this.http
      .post<AiCommandResponseDto>(`${environment.apiUrl}/chat/boards/${boardId}/audio`, formData)
      .pipe(map((dto) => AiChatAdapter.toAiCommandResponse(dto)));
  }
}
