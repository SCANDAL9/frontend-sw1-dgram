import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { HistoryItem, HistoryDetail, RestoreResponse, TimelineFilter } from '../models/history.model';
import {
  HistoryAdapter,
  HistoryItemDto,
  HistoryDetailDto,
  RestoreResponseDto,
  SnapshotDto,
} from '../adapters/history.adapter';

@Injectable({ providedIn: 'root' })
export class HistoryApiService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getHistory(
    boardId: string,
    filter?: TimelineFilter,
    limit: number = 50,
    offset: number = 0
  ): Observable<HistoryItem[]> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (filter?.actor_type && filter.actor_type !== 'all') {
      params = params.set('actor_type', filter.actor_type);
    }
    if (filter?.command_type) {
      params = params.set('command_type', filter.command_type);
    }
    if (filter?.from_version !== undefined && filter.from_version !== null) {
      params = params.set('from_version', filter.from_version.toString());
    }
    if (filter?.to_version !== undefined && filter.to_version !== null) {
      params = params.set('to_version', filter.to_version.toString());
    }

    return this.http
      .get<HistoryItemDto[]>(`${this.api}/boards/${boardId}/history`, { params })
      .pipe(map((dtos) => HistoryAdapter.toHistoryItemList(dtos)));
  }

  getHistoryDetail(boardId: string, historyId: string): Observable<HistoryDetail> {
    return this.http
      .get<HistoryDetailDto>(`${this.api}/boards/${boardId}/history/${historyId}`)
      .pipe(map((dto) => HistoryAdapter.toHistoryDetail(dto)));
  }

  restoreVersion(boardId: string, version: number): Observable<RestoreResponse> {
    return this.http
      .post<RestoreResponseDto>(`${this.api}/boards/${boardId}/restore/${version}`, {})
      .pipe(map((dto) => HistoryAdapter.toRestoreResponse(dto)));
  }

  getSnapshots(boardId: string): Observable<SnapshotDto[]> {
    return this.http.get<SnapshotDto[]>(`${this.api}/boards/${boardId}/snapshots`);
  }
}
