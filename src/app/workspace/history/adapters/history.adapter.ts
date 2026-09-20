import {
  HistoryItem,
  HistoryDetail,
  RestoreResponse,
} from '../models/history.model';

export interface HistoryItemDto {
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

export interface HistoryDetailDto {
  entry: HistoryItemDto;
  diff: {
    summary?: string;
    target_name?: string;
    fields_changed: number;
    changes: Array<{ field: string; value: any }>;
  };
}

export interface RestoreResponseDto {
  success?: boolean;
  restored_version?: number;
  new_diagram_version?: number;
  message?: string;
}

export interface SnapshotDto {
  id: string;
  version: number;
  created_by?: string;
}

/**
 * Adaptador puro para transformar DTOs del backend del historial a modelos de UI.
 */
export class HistoryAdapter {
  static toHistoryItem(dto: HistoryItemDto): HistoryItem {
    return {
      id: dto.id || '',
      board_id: dto.board_id || '',
      command_id: dto.command_id || '',
      command_type: dto.command_type || '',
      payload: dto.payload || {},
      actor_id: dto.actor_id || null,
      actor_type: dto.actor_type || null,
      model_version: dto.model_version ?? null,
      created_at: dto.created_at || null,
      summary: dto.summary || null,
      target_name: dto.target_name || null,
    };
  }

  static toHistoryItemList(dtos: HistoryItemDto[] | null | undefined): HistoryItem[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toHistoryItem(dto));
  }

  static toHistoryDetail(dto: HistoryDetailDto): HistoryDetail {
    return {
      entry: this.toHistoryItem(dto.entry),
      diff: {
        summary: dto.diff?.summary,
        target_name: dto.diff?.target_name,
        fields_changed: dto.diff?.fields_changed ?? 0,
        changes: Array.isArray(dto.diff?.changes) ? dto.diff.changes : [],
      },
    };
  }

  static toRestoreResponse(dto: RestoreResponseDto): RestoreResponse {
    return {
      success: !!dto.success,
      restored_version: dto.restored_version ?? 0,
      new_diagram_version: dto.new_diagram_version ?? 0,
      message: dto.message || '',
    };
  }
}
