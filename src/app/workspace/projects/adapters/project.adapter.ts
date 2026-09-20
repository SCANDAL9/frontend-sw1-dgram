import {
  Project,
  ProjectBoard,
  ProjectMember,
  ProjectCreatePayload,
  ProjectUpdatePayload,
  MemberInvitePayload,
  MemberRoleUpdatePayload,
} from '../models/project.models';

export interface ProjectDto {
  id?: string;
  project_id?: string;
  name: string;
  description?: string | null;
  owner_id?: string;
  my_role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectBoardDto {
  id?: string;
  board_id?: string;
  name: string;
  project_id: string;
  owner_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectMemberDto {
  user_id?: string;
  id?: string;
  email: string;
  full_name?: string | null;
  name?: string | null;
  role: 'owner' | 'editor' | 'viewer' | string;
  joined_at?: string | null;
  created_at?: string | null;
}

/**
 * Adaptador puro para transformar DTOs de red de Proyectos y Miembros a modelos de UI.
 */
export class ProjectAdapter {
  static toProjectModel(dto: ProjectDto): Project {
    return {
      id: dto.id || dto.project_id || '',
      name: dto.name || '',
      description: dto.description || null,
      owner_id: dto.owner_id || '',
      my_role: (dto.my_role as any) || null,
      created_at: dto.created_at || null,
      updated_at: dto.updated_at || null,
    };
  }

  static toProjectList(dtos: ProjectDto[] | null | undefined): Project[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toProjectModel(dto));
  }

  static toProjectBoardModel(dto: ProjectBoardDto): ProjectBoard {
    return {
      id: dto.id || dto.board_id || '',
      name: dto.name || '',
      project_id: dto.project_id || '',
      owner_id: dto.owner_id || null,
      created_at: dto.created_at || null,
      updated_at: dto.updated_at || null,
    };
  }

  static toProjectBoardList(dtos: ProjectBoardDto[] | null | undefined): ProjectBoard[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toProjectBoardModel(dto));
  }

  static toProjectMemberModel(dto: ProjectMemberDto): ProjectMember {
    return {
      user_id: dto.user_id || dto.id || '',
      email: dto.email || '',
      full_name: dto.full_name || dto.name || '',
      role: (dto.role as any) || 'viewer',
      joined_at: dto.joined_at || dto.created_at || null,
    };
  }

  static toProjectMemberList(dtos: ProjectMemberDto[] | null | undefined): ProjectMember[] {
    if (!Array.isArray(dtos)) return [];
    return dtos.map((dto) => this.toProjectMemberModel(dto));
  }

  static toCreatePayload(model: ProjectCreatePayload): { name: string; description?: string | null } {
    return {
      name: model.name.trim(),
      description: model.description ? model.description.trim() : null,
    };
  }

  static toUpdatePayload(model: ProjectUpdatePayload): { name?: string | null; description?: string | null } {
    const payload: { name?: string | null; description?: string | null } = {};
    if (model.name !== undefined) payload.name = model.name ? model.name.trim() : null;
    if (model.description !== undefined) payload.description = model.description ? model.description.trim() : null;
    return payload;
  }

  static toInvitePayload(model: MemberInvitePayload): { email: string; role: 'editor' | 'viewer' } {
    return {
      email: model.email.trim(),
      role: model.role,
    };
  }

  static toRoleUpdatePayload(model: MemberRoleUpdatePayload): { role: 'editor' | 'viewer' } {
    return {
      role: model.role,
    };
  }
}
