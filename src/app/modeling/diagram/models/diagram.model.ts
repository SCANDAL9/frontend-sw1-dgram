export interface DBAttribute {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
  references: string | null;
  visibility?: string; // '+', '-', '#', '~'
  isDerived?: boolean;
  defaultValue?: string | null;
}

export type ClassifierType = 'class' | 'abstract_class' | 'interface' | 'enumeration' | 'datatype';

export interface DBEntity {
  id: string;
  name: string;
  attributes: DBAttribute[];
  position: { x: number; y: number };
  elementType?: ClassifierType;
  stereotype?: string | null; // e.g. 'entity', 'service', 'repository', 'controller', 'enumeration', 'interface', 'datatype'
  isAbstract?: boolean;
}

export interface DBRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  sourceColumn: string;
  targetColumn: string;
  name?: string | null;
  sourceMultiplicity?: string | null;
  targetMultiplicity?: string | null;
  associationClassId?: string | null;
}

export interface DiagramState {
  entities: DBEntity[];
  relations: DBRelation[];
  version: number;
  // UML aliases — populated by backend for forward compat
  classes?: DBEntity[];
  associations?: DBRelation[];
  columns?: DBAttribute[];
}

// UML aliases — UI habla Class/Association, wire sigue Entity/Relation
export type DBClass = DBEntity;
export type UMLAssociation = DBRelation;
export type UMLAttribute = DBAttribute;
