import {
  XmiPreviewResponse,
  XmiImportResponse,
  XmiPreviewClass,
  XmiPreviewAssociation,
} from '../models/xmi-preview.model';

export interface XmiPreviewClassDto {
  name: string;
  action: 'create' | 'update';
  attributes_count?: number;
  existing_id?: string | null;
}

export interface XmiPreviewAssociationDto {
  name?: string | null;
  source_class: string;
  target_class: string;
  association_type: string;
  source_multiplicity?: string | null;
  target_multiplicity?: string | null;
  source_role?: string | null;
  target_role?: string | null;
}

export interface XmiPreviewResponseDto {
  file_name?: string;
  total_classes?: number;
  to_create_classes_count?: number;
  to_update_classes_count?: number;
  classes?: XmiPreviewClassDto[];
  associations?: XmiPreviewAssociationDto[];
  warnings?: string[];
}

export interface XmiImportResponseDto {
  status: string;
  message: string;
  classes?: string[];
  updated_classes?: string[];
  associations_count?: number;
}

/**
 * Adaptador puro para respuestas de importación/previsualización XMI.
 */
export class XmiAdapter {
  static toPreviewClass(dto: XmiPreviewClassDto): XmiPreviewClass {
    return {
      name: dto.name,
      action: dto.action,
      attributes_count: dto.attributes_count ?? 0,
      existing_id: dto.existing_id || null,
    };
  }

  static toPreviewAssociation(dto: XmiPreviewAssociationDto): XmiPreviewAssociation {
    return {
      name: dto.name || null,
      source_class: dto.source_class,
      target_class: dto.target_class,
      association_type: dto.association_type,
      source_multiplicity: dto.source_multiplicity || null,
      target_multiplicity: dto.target_multiplicity || null,
      source_role: dto.source_role || null,
      target_role: dto.target_role || null,
    };
  }

  static toPreviewResponse(dto: XmiPreviewResponseDto): XmiPreviewResponse {
    return {
      file_name: dto.file_name || '',
      total_classes: dto.total_classes ?? 0,
      to_create_classes_count: dto.to_create_classes_count ?? 0,
      to_update_classes_count: dto.to_update_classes_count ?? 0,
      classes: Array.isArray(dto.classes) ? dto.classes.map((c) => this.toPreviewClass(c)) : [],
      associations: Array.isArray(dto.associations)
        ? dto.associations.map((a) => this.toPreviewAssociation(a))
        : [],
      warnings: dto.warnings || [],
    };
  }

  static toImportResponse(dto: XmiImportResponseDto): XmiImportResponse {
    return {
      status: dto.status || 'success',
      message: dto.message || '',
      classes: dto.classes || [],
      updated_classes: dto.updated_classes || [],
      associations_count: dto.associations_count ?? 0,
    };
  }
}
