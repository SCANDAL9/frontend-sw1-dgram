import {
  Board,
  BoardCreate,
  DiagramStateResponse,
  ProjectClass,
  ProjectClassAttribute,
  BoardMember,
} from '../models/board.model';

export interface BoardDto {
  id?: string;
  board_id?: string;
  name: string;
  description?: string | null;
  owner_id?: string;
  project_id?: string | null;
  diagram_version?: number;
  entities_count?: number;
  relations_count?: number;
  preview_entities?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface DiagramStateDto {
  entities?: unknown[];
  relations?: unknown[];
  classes?: unknown[];
  associations?: unknown[];
  version?: number;
}

export interface ProjectClassAttributeDto {
  id?: string;
  name: string;
  data_type?: string;
  dataType?: string;
  type?: string;
  visibility?: string;
  is_pkey?: boolean;
  isPkey?: boolean;
}

export interface ProjectClassDto {
  id?: string;
  name: string;
  package_id?: string;
  packageId?: string;
  element_type?: string;
  elementType?: string;
  is_abstract?: boolean;
  isAbstract?: boolean;
  attributes?: ProjectClassAttributeDto[];
  boards_count?: number;
  boardsCount?: number;
  is_on_current_board?: boolean;
}

export interface BoardMemberDto {
  user_id?: string;
  id?: string;
  email: string;
  full_name?: string;
  name?: string;
  role: 'owner' | 'editor' | 'viewer' | string;
  joined_at?: string | null;
}

/**
 * Adaptador puro para transformar DTOs del Backend a modelos de UI para Diagramas y Tableros.
 */
export class BoardAdapter {
  static toBoardModel(dto: BoardDto): Board {
    return {
      id: dto.id || dto.board_id || '',
      name: dto.name || '',
      description: dto.description || null,
      owner_id: dto.owner_id || '',
      project_id: dto.project_id || null,
      diagram_version: dto.diagram_version ?? 1,
      entities_count: dto.entities_count ?? 0,
      relations_count: dto.relations_count ?? 0,
      preview_entities: dto.preview_entities || [],
      created_at: dto.created_at || new Date().toISOString(),
    };
  }

  static toBoardList(dtos: BoardDto[] | null | undefined): Board[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toBoardModel(dto));
  }

  static toDiagramStateResponse(dto: DiagramStateDto | null | undefined): DiagramStateResponse {
    return {
      entities: dto?.entities || [],
      relations: dto?.relations || [],
      classes: dto?.classes || [],
      associations: dto?.associations || [],
      version: dto?.version ?? 1,
    };
  }

  static toProjectClassAttribute(dto: ProjectClassAttributeDto): ProjectClassAttribute {
    return {
      id: dto.id || '',
      name: dto.name || '',
      data_type: dto.data_type || dto.dataType || dto.type || 'String',
      visibility: dto.visibility || '+',
      is_pkey: !!(dto.is_pkey ?? dto.isPkey),
    };
  }

  static toProjectClass(dto: ProjectClassDto): ProjectClass {
    return {
      id: dto.id || '',
      name: dto.name || '',
      package_id: dto.package_id || dto.packageId || '',
      element_type: dto.element_type || dto.elementType || 'class',
      is_abstract: !!(dto.is_abstract ?? dto.isAbstract),
      attributes: Array.isArray(dto.attributes)
        ? dto.attributes.map((a) => this.toProjectClassAttribute(a))
        : [],
      boards_count: dto.boards_count ?? dto.boardsCount ?? 0,
      is_on_current_board: dto.is_on_current_board,
    };
  }

  static toProjectClassList(dtos: ProjectClassDto[] | null | undefined): ProjectClass[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toProjectClass(dto));
  }

  static toBoardMember(dto: BoardMemberDto): BoardMember {
    return {
      user_id: dto.user_id || dto.id || '',
      email: dto.email || '',
      full_name: dto.full_name || dto.name || '',
      role: (dto.role as any) || 'viewer',
      joined_at: dto.joined_at || null,
    };
  }

  static toBoardMemberList(dtos: BoardMemberDto[] | null | undefined): BoardMember[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toBoardMember(dto));
  }

  static toBoardCreatePayload(model: BoardCreate): {
    name: string;
    description?: string | null;
    owner_id?: string;
    project_id?: string | null;
  } {
    return {
      name: model.name.trim(),
      description: model.description ? model.description.trim() : null,
      owner_id: model.owner_id,
      project_id: model.project_id || null,
    };
  }
}
