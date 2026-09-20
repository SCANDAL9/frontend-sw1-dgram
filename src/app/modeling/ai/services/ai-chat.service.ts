import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ChatMsg, AiCommandResponse } from '../models/ai-chat.models';
import { AiChatAdapter, ChatMsgDto, AiCommandResponseDto } from '../adapters/ai-chat.adapter';

@Injectable({ providedIn: 'root' })
export class AiChatService {
  private http = inject(HttpClient);

  getHistory(boardId: string): Observable<ChatMsg[]> {
    return this.http
      .get<ChatMsgDto[]>(`${environment.apiUrl}/chat/boards/${boardId}/messages`)
      .pipe(map((dtos) => AiChatAdapter.toChatMsgList(dtos)));
  }

  sendMessage(boardId: string, text: string, userId?: string): Observable<AiCommandResponse> {
    return this.http
      .post<AiCommandResponseDto>(`${environment.apiUrl}/chat/boards/${boardId}/message`, {
        text,
        user_id: userId,
      })
      .pipe(map((dto) => AiChatAdapter.toAiCommandResponse(dto)));
  }

  sendVision(boardId: string, image: File, prompt?: string, userId?: string): Observable<AiCommandResponse> {
    const formData = new FormData();
    formData.append('file', image);
    if (prompt) {
      formData.append('prompt', prompt);
    }
    if (userId) {
      formData.append('user_id', userId);
    }
    return this.http
      .post<AiCommandResponseDto>(`${environment.apiUrl}/chat/boards/${boardId}/vision`, formData)
      .pipe(map((dto) => AiChatAdapter.toAiCommandResponse(dto)));
  }
}
