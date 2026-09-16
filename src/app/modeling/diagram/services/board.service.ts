import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

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
  entities: any[];
  relations: any[];
  classes: any[];
  associations: any[];
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
  attributes: ProjectClassAttribute[];
  boards_count: number;
  is_on_current_board?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BoardService {
  private http = inject(HttpClient);

  list() {
    return this.http.get<Board[]>(`${environment.apiUrl}/boards`);
  }

  create(data: BoardCreate) {
    return this.http.post<Board>(`${environment.apiUrl}/boards`, data);
  }

  get(id: string) {
    return this.http.get<Board>(`${environment.apiUrl}/boards/${id}`);
  }

  getState(id: string) {
    return this.http.get<DiagramStateResponse>(`${environment.apiUrl}/boards/${id}/state`);
  }

  delete(id: string) {
    return this.http.delete(`${environment.apiUrl}/boards/${id}`);
  }

  update(id: string, data: { name?: string; description?: string | null }) {
    return this.http.patch<Board>(`${environment.apiUrl}/boards/${id}`, data);
  }

  getProjectClasses(boardId: string) {
    return this.http.get<ProjectClass[]>(`${environment.apiUrl}/boards/${boardId}/project-classes`);
  }

  attachClass(boardId: string, classId: string, position: { x: number; y: number } = { x: 120, y: 120 }) {
    return this.http.post(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/attach`, position);
  }

  detachClass(boardId: string, classId: string) {
    return this.http.delete(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/detach`);
  }

  deleteClassFromProject(projectId: string, classId: string) {
    return this.http.delete(`${environment.apiUrl}/projects/${projectId}/classes/${classId}`);
  }

  deleteClassFromModel(boardId: string, classId: string) {
    return this.http.delete(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/model`);
  }

  importXmi(boardId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ status: string; message: string; classes: string[]; associations_count: number }>(
      `${environment.apiUrl}/boards/${boardId}/import/xmi`,
      formData
    );
  }

  generateCode(boardId: string, basePackage: string = 'com.dgram.generated') {
    return this.http.post<{ job_id: string; status: string; files: Record<string, string> }>(
      `${environment.apiUrl}/codegen/boards/${boardId}?base_package=${encodeURIComponent(basePackage)}`,
      {}
    );
  }

  downloadCodeZipUrl(boardId: string, basePackage: string = 'com.dgram.generated'): string {
    return `${environment.apiUrl}/codegen/boards/${boardId}/download?base_package=${encodeURIComponent(basePackage)}`;
  }
}