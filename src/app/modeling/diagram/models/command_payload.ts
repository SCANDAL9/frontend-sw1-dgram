export interface ColumnData {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
  references: string | null;
  visibility?: string;
  is_derived?: boolean;
  default_value?: string | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface CommandPayload {
  entity_id?: string;
  entity_name?: string;
  columns?: ColumnData[];
  column_name?: string;
  column_changes?: Record<string, any>;
  position?: Position;
  source_entity_id?: string;
  target_entity_id?: string;
  relation_type?: string;
  source_column?: string;
  target_column?: string;
  relation_id?: string;
  // UML aliases
  class_id?: string;
  class_name?: string;
  attributes?: ColumnData[];
  attribute_name?: string;
  attribute_changes?: Record<string, any>;
  source_class_id?: string;
  target_class_id?: string;
  association_type?: string;
  source_attribute?: string;
  target_attribute?: string;
  association_id?: string;
  // Resize
  width?: number;
  height?: number;
  // Packages
  package_id?: string;
  package_name?: string;
  // Roles & multiplicities
  source_role?: string;
  target_role?: string;
  source_multiplicity?: string;
  target_multiplicity?: string;
  // Classifier metadata
  name?: string;
  is_abstract?: boolean;
  isAbstract?: boolean;
  is_visible?: boolean;
  isVisible?: boolean;
  element_type?: string;
  elementType?: string;
  stereotype?: string;
}
