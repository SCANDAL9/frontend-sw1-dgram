import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

import { Board, BoardCreate, DiagramStateResponse, ProjectClass, ProjectClassAttribute } from '../models/board.model';
import {
  BoardAdapter,
  BoardDto,
  DiagramStateDto,
  ProjectClassDto,
} from '../adapters/board.adapter';

export type { Board, BoardCreate, DiagramStateResponse, ProjectClass, ProjectClassAttribute };

@Injectable({ providedIn: 'root' })
export class BoardService {
  private http = inject(HttpClient);

  list(): Observable<Board[]> {
    return this.http
      .get<BoardDto[]>(`${environment.apiUrl}/boards`)
      .pipe(map((dtos) => BoardAdapter.toBoardList(dtos)));
  }

  create(data: BoardCreate): Observable<Board> {
    const payload = BoardAdapter.toBoardCreatePayload(data);
    return this.http
      .post<BoardDto>(`${environment.apiUrl}/boards`, payload)
      .pipe(map((dto) => BoardAdapter.toBoardModel(dto)));
  }

  get(id: string): Observable<Board> {
    return this.http
      .get<BoardDto>(`${environment.apiUrl}/boards/${id}`)
      .pipe(map((dto) => BoardAdapter.toBoardModel(dto)));
  }

  getState(id: string): Observable<DiagramStateResponse> {
    return this.http
      .get<DiagramStateDto>(`${environment.apiUrl}/boards/${id}/state`)
      .pipe(map((dto) => BoardAdapter.toDiagramStateResponse(dto)));
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${environment.apiUrl}/boards/${id}`);
  }

  update(id: string, data: { name?: string; description?: string | null }): Observable<Board> {
    return this.http
      .patch<BoardDto>(`${environment.apiUrl}/boards/${id}`, data)
      .pipe(map((dto) => BoardAdapter.toBoardModel(dto)));
  }

  getProjectClasses(boardId: string): Observable<ProjectClass[]> {
    return this.http
      .get<ProjectClassDto[]>(`${environment.apiUrl}/boards/${boardId}/project-classes`)
      .pipe(map((dtos) => BoardAdapter.toProjectClassList(dtos)));
  }

  attachClass(boardId: string, classId: string, position: { x: number; y: number } = { x: 120, y: 120 }): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/attach`, position);
  }

  detachClass(boardId: string, classId: string): Observable<unknown> {
    return this.http.delete(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/detach`);
  }

  deleteClassFromProject(projectId: string, classId: string): Observable<unknown> {
    return this.http.delete(`${environment.apiUrl}/projects/${projectId}/classes/${classId}`);
  }

  deleteClassFromModel(boardId: string, classId: string): Observable<unknown> {
    return this.http.delete(`${environment.apiUrl}/boards/${boardId}/classes/${classId}/model`);
  }
}