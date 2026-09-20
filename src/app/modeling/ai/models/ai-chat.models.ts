export interface ChatMsg {
  id?: string;
  sender_type: 'user' | 'ai' | 'system';
  user_id?: string | null;
  content: string;
  created_at?: string;
  commands?: any[];
  agent?: string;
  traces?: any[];
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
