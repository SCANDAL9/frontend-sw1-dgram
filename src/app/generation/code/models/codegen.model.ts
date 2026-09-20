export type LayerFilterType =
  | 'ALL'
  | 'ENTITY'
  | 'SERVICE'
  | 'CONTROLLER'
  | 'REPOSITORY'
  | 'DTO_MAPPER'
  | 'OTHER';

export interface CodegenResponse {
  job_id: string;
  status: string;
  files: Record<string, string>;
}
