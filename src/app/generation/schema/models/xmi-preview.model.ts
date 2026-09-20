export interface XmiPreviewClass {
  name: string;
  action: 'create' | 'update';
  attributes_count: number;
  existing_id?: string | null;
}

export interface XmiPreviewAssociation {
  name?: string | null;
  source_class: string;
  target_class: string;
  association_type: string;
  source_multiplicity?: string | null;
  target_multiplicity?: string | null;
  source_role?: string | null;
  target_role?: string | null;
}

export interface XmiPreviewResponse {
  file_name: string;
  total_classes: number;
  to_create_classes_count: number;
  to_update_classes_count: number;
  classes: XmiPreviewClass[];
  associations: XmiPreviewAssociation[];
  warnings: string[];
}

export interface XmiImportResponse {
  status: string;
  message: string;
  classes: string[];
  updated_classes: string[];
  associations_count: number;
}
