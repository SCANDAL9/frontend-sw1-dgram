import { CodegenResponse } from '../models/codegen.model';

export interface CodegenResponseDto {
  job_id?: string;
  status?: string;
  files?: Record<string, string>;
}

/**
 * Adaptador puro para transformar la respuesta del backend de generación de código.
 */
export class CodegenAdapter {
  static toCodegenResponse(dto: CodegenResponseDto): CodegenResponse {
    return {
      job_id: dto.job_id || '',
      status: dto.status || 'completed',
      files: dto.files || {},
    };
  }
}
