import { ChatMsg, AiCommandResponse } from '../models/ai-chat.models';

export interface ChatMsgDto {
  id?: string;
  sender_type?: 'user' | 'ai' | 'system' | string;
  user_id?: string | null;
  content: string;
  created_at?: string;
  commands?: any[];
  agent?: string;
  traces?: any[];
}

export interface AiCommandResponseDto {
  reply: string;
  commands?: any[];
}

/**
 * Adaptador puro para transformar mensajes y comandos del asistente Vertex AI.
 */
export class AiChatAdapter {
  static toChatMsg(dto: ChatMsgDto): ChatMsg {
    return {
      id: dto.id || '',
      sender_type: (dto.sender_type as any) || 'ai',
      user_id: dto.user_id || null,
      content: dto.content || '',
      created_at: dto.created_at || new Date().toISOString(),
      commands: Array.isArray(dto.commands) ? dto.commands : [],
      agent: dto.agent || undefined,
      traces: Array.isArray(dto.traces) ? dto.traces : [],
    };
  }

  static toChatMsgList(dtos: ChatMsgDto[] | null | undefined): ChatMsg[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toChatMsg(dto));
  }

  static toAiCommandResponse(dto: AiCommandResponseDto): AiCommandResponse {
    return {
      reply: dto.reply || '',
      commands: Array.isArray(dto.commands) ? dto.commands : [],
    };
  }
}
