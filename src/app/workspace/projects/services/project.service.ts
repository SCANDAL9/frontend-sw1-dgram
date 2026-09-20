import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
  ProjectBoard,
  ProjectMember,
  MemberInvitePayload,
  MemberRoleUpdatePayload,
} from '../models/project.models';
import {
  ProjectAdapter,
  ProjectDto,
  ProjectBoardDto,
  ProjectMemberDto,
} from '../adapters/project.adapter';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/projects`;

  /**
   * Obtiene la lista de proyectos a los que pertenece el usuario (propietario o colaborador).
   */
  listProjects(search?: string): Observable<Project[]> {
    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http
      .get<ProjectDto[]>(this.baseUrl, { params })
      .pipe(map((dtos) => ProjectAdapter.toProjectList(dtos)));
  }

  /**
   * Crea un nuevo proyecto.
   */
  createProject(payload: ProjectCreatePayload): Observable<Project> {
    const body = ProjectAdapter.toCreatePayload(payload);
    return this.http
      .post<ProjectDto>(this.baseUrl, body)
      .pipe(map((dto) => ProjectAdapter.toProjectModel(dto)));
  }

  /**
   * Obtiene el detalle de un proyecto por ID.
   */
  getProject(projectId: string): Observable<Project> {
    return this.http
      .get<ProjectDto>(`${this.baseUrl}/${projectId}`)
      .pipe(map((dto) => ProjectAdapter.toProjectModel(dto)));
  }

  /**
   * Actualiza el nombre o descripción de un proyecto.
   */
  updateProject(projectId: string, payload: ProjectUpdatePayload): Observable<Project> {
    const body = ProjectAdapter.toUpdatePayload(payload);
    return this.http
      .put<ProjectDto>(`${this.baseUrl}/${projectId}`, body)
      .pipe(map((dto) => ProjectAdapter.toProjectModel(dto)));
  }

  /**
   * Elimina un proyecto (solo owner).
   */
  deleteProject(projectId: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.baseUrl}/${projectId}`);
  }

  /**
   * Lista los tableros que pertenecen a un proyecto.
   */
  listProjectBoards(projectId: string): Observable<ProjectBoard[]> {
    return this.http
      .get<ProjectBoardDto[]>(`${this.baseUrl}/${projectId}/boards`)
      .pipe(map((dtos) => ProjectAdapter.toProjectBoardList(dtos)));
  }

  /**
   * Crea un nuevo tablero dentro de un proyecto.
   */
  createProjectBoard(projectId: string, name: string = 'Main Diagram'): Observable<ProjectBoard> {
    return this.http
      .post<ProjectBoardDto>(`${this.baseUrl}/${projectId}/boards`, { name })
      .pipe(map((dto) => ProjectAdapter.toProjectBoardModel(dto)));
  }

  /**
   * Lista los miembros de un tablero (resuelto a través de su proyecto asociado).
   */
  listBoardMembers(boardId: string): Observable<ProjectMember[]> {
    return this.http
      .get<ProjectMemberDto[]>(`${environment.apiUrl}/boards/${boardId}/members`)
      .pipe(map((dtos) => ProjectAdapter.toProjectMemberList(dtos)));
  }

  /**
   * Invita a un colaborador a un tablero.
   */
  inviteBoardMember(boardId: string, payload: MemberInvitePayload): Observable<ProjectMember> {
    const body = ProjectAdapter.toInvitePayload(payload);
    return this.http
      .post<ProjectMemberDto>(`${environment.apiUrl}/boards/${boardId}/members/invite`, body)
      .pipe(map((dto) => ProjectAdapter.toProjectMemberModel(dto)));
  }

  /**
   * Cambia el rol de un colaborador en el tablero.
   */
  updateBoardMemberRole(boardId: string, userId: string, role: 'editor' | 'viewer'): Observable<ProjectMember> {
    const body = ProjectAdapter.toRoleUpdatePayload({ role });
    return this.http
      .put<ProjectMemberDto>(`${environment.apiUrl}/boards/${boardId}/members/${userId}`, body)
      .pipe(map((dto) => ProjectAdapter.toProjectMemberModel(dto)));
  }

  /**
   * Expulsa o elimina a un colaborador del tablero.
   */
  removeBoardMember(boardId: string, userId: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${environment.apiUrl}/boards/${boardId}/members/${userId}`);
  }
}
