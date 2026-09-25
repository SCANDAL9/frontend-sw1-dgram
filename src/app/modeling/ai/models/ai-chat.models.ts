export interface ChatAttachmentItem {
  id: string;
  type: 'image' | 'audio' | 'document' | 'other';
  storage_url: string;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  created_at?: string;
}

export interface ChatMsg {
  id?: string;
  sender_type: 'user' | 'ai' | 'system';
  user_id?: string | null;
  content: string;
  created_at?: string;
  commands?: any[];
  agent?: string;
  traces?: any[];
  attachments?: ChatAttachmentItem[];
}

export interface AiCommandResponse {
  reply: string;
  commands?: any[];
}

export interface PendingConfirmation {
  title?: string;
  description: string;
  commands: any[];
  isVision?: boolean;
  detectedEntities?: string[];
}

export interface ChatConversationSession {
  id: string;
  board_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}
