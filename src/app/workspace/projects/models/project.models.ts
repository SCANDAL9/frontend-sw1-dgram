/**
 * Modelos de datos para Proyectos y Miembros Colaboradores (CU02).
 */

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  my_role?: ProjectRole | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectCreatePayload {
  name: string;
  description?: string | null;
}

export interface ProjectUpdatePayload {
  name?: string | null;
  description?: string | null;
}

export interface ProjectBoard {
  id: string;
  name: string;
  project_id: string;
  owner_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  full_name: string;
  role: ProjectRole;
  joined_at?: string | null;
}

export interface MemberInvitePayload {
  email: string;
  role: 'editor' | 'viewer';
}

export interface MemberRoleUpdatePayload {
  role: 'editor' | 'viewer';
}
