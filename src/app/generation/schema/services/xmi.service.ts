import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { XmiPreviewResponse, XmiImportResponse } from '../models/xmi-preview.model';
import { XmiAdapter, XmiPreviewResponseDto, XmiImportResponseDto } from '../adapters/xmi.adapter';

@Injectable({ providedIn: 'root' })
export class XmiService {
  private http = inject(HttpClient);

  previewXmi(boardId: string, file: File): Observable<XmiPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<XmiPreviewResponseDto>(
        `${environment.apiUrl}/boards/${boardId}/import/xmi/preview`,
        formData
      )
      .pipe(map((dto) => XmiAdapter.toPreviewResponse(dto)));
  }

  importXmi(boardId: string, file: File): Observable<XmiImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<XmiImportResponseDto>(
        `${environment.apiUrl}/boards/${boardId}/import/xmi`,
        formData
      )
      .pipe(map((dto) => XmiAdapter.toImportResponse(dto)));
  }
}
