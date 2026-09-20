export interface HistoryItem {
  id: string;
  board_id: string;
  command_id: string;
  command_type: string;
  payload: Record<string, any>;
  actor_id?: string | null;
  actor_type?: 'user' | 'ai' | null;
  model_version?: number | null;
  created_at?: string | null;
  summary?: string | null;
  target_name?: string | null;
}

export interface TimelineFilter {
  actor_type?: 'all' | 'user' | 'ai';
  command_type?: string;
  from_version?: number;
  to_version?: number;
  search?: string;
}

export interface HistoryDetail {
  entry: HistoryItem;
  diff: {
    summary?: string;
    target_name?: string;
    fields_changed: number;
    changes: Array<{ field: string; value: any }>;
  };
}

export interface RestoreResponse {
  success: boolean;
  restored_version: number;
  new_diagram_version: number;
  message: string;
}
