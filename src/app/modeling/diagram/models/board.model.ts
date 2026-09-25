export interface Board {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  project_id?: string | null;
  diagram_version?: number;
  entities_count?: number;
  relations_count?: number;
  preview_entities?: string[];
  created_at: string;
}

export interface BoardCreate {
  name: string;
  description?: string | null;
  owner_id?: string;
  project_id?: string | null;
}

export interface DiagramStateResponse {
  entities: unknown[];
  relations: unknown[];
  classes: unknown[];
  associations: unknown[];
  version: number;
}

export interface ProjectClassAttribute {
  id: string;
  name: string;
  data_type: string;
  visibility: string;
  is_pkey: boolean;
}

export interface ProjectClass {
  id: string;
  name: string;
  package_id: string;
  element_type: string;
  is_abstract: boolean;
  is_visible?: boolean;
  isVisible?: boolean;
  attributes: ProjectClassAttribute[];
  boards_count: number;
  is_on_current_board?: boolean;
}

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface BoardMember {
  user_id: string;
  email: string;
  full_name: string;
  role: MemberRole;
  joined_at?: string | null;
}
