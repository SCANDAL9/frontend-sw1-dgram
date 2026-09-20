import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CodegenResponse } from '../models/codegen.model';
import { CodegenAdapter, CodegenResponseDto } from '../adapters/codegen.adapter';

@Injectable({ providedIn: 'root' })
export class CodegenService {
  private http = inject(HttpClient);

  generateCode(
    boardId: string,
    basePackage: string = 'com.dgram.generated'
  ): Observable<CodegenResponse> {
    return this.http
      .post<CodegenResponseDto>(
        `${environment.apiUrl}/codegen/boards/${boardId}?base_package=${encodeURIComponent(basePackage)}`,
        {}
      )
      .pipe(map((dto) => CodegenAdapter.toCodegenResponse(dto)));
  }

  downloadCodeZipUrl(
    boardId: string,
    basePackage: string = 'com.dgram.generated'
  ): string {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('dgram_auth_token') || ''
        : '';
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${environment.apiUrl}/codegen/boards/${boardId}/download?base_package=${encodeURIComponent(basePackage)}${tokenParam}`;
  }
}
