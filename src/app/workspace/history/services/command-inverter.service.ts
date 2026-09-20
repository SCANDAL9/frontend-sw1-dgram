import { Command } from '../../../modeling/diagram/models/command';
import { CommandPayload } from '../../../modeling/diagram/models/command_payload';
import { CommandType } from '../../../modeling/diagram/models/command_type';
import { DiagramState, DBEntity, DBRelation } from '../../../modeling/diagram/models/diagram.model';




/** Snapshot of diagram state BEFORE a command was applied. */
export type StateSnapshot = DiagramState;

export interface InverseResult {
  type: CommandType;
  payload: CommandPayload;
}

type InverseFn = (
  cmd: Command,
  snapshot: StateSnapshot
) => InverseResult | null;

// ─── Inverse map ──────────────────────────────────────────────────────────────

const INVERSE_MAP: Partial<Record<CommandType, InverseFn>> = {

  CREATE_ENTITY: (cmd) => ({
    type: 'DELETE_ENTITY',
    payload: { entity_id: cmd.payload.entity_id },
  }),

  DELETE_ENTITY: (cmd, snapshot) => {
    const entity = snapshot.entities.find((e) => e.id === cmd.payload.entity_id);
    if (!entity) return null;
    return {
      type: 'CREATE_ENTITY',
      payload: {
        entity_id: entity.id,
        entity_name: entity.name,
        columns: (entity.attributes || (entity as any).columns) as any,
        position: entity.position,
      },
    };
  },

  UPDATE_ENTITY: (cmd, snapshot) => {
    const entity = snapshot.entities.find((e) => e.id === cmd.payload.entity_id);
    if (!entity) return null;
    return {
      type: 'UPDATE_ENTITY',
      payload: {
        entity_id: entity.id,
        entity_name: entity.name,
        stereotype: entity.stereotype ?? null,
        is_abstract: entity.isAbstract ?? false,
      },
    };
  },

  MOVE_ENTITY: (cmd, snapshot) => {
    const entity = snapshot.entities.find((e) => e.id === cmd.payload.entity_id);
    if (!entity) return null;
    return {
      type: 'MOVE_ENTITY',
      payload: { entity_id: entity.id, position: entity.position },
    };
  },

  ADD_COLUMN: (cmd) => ({
    type: 'DELETE_COLUMN',
    payload: {
      entity_id: cmd.payload.entity_id,
      column_name: (cmd.payload.column_changes as any)?.name ?? cmd.payload.column_name,
    },
  }),

  DELETE_COLUMN: (cmd, snapshot) => {
    const entity = snapshot.entities.find((e) => e.id === cmd.payload.entity_id);
    const cols = entity?.attributes || (entity as any)?.columns || [];
    const col = cols.find((c: any) => c.name === cmd.payload.column_name);
    if (!col) return null;
    return {
      type: 'ADD_COLUMN',
      payload: { entity_id: cmd.payload.entity_id, column_changes: col as any },
    };
  },

  UPDATE_COLUMN: (cmd, snapshot) => {
    const entity = snapshot.entities.find((e) => e.id === cmd.payload.entity_id);
    const cols = entity?.attributes || (entity as any)?.columns || [];
    const col = cols.find((c: any) => c.name === cmd.payload.column_name);
    if (!col) return null;
    return {
      type: 'UPDATE_COLUMN',
      payload: {
        entity_id: cmd.payload.entity_id,
        column_name: cmd.payload.column_name,
        column_changes: col as any,
      },
    };
  },

  CREATE_RELATION: (cmd) => ({
    type: 'DELETE_RELATION',
    payload: { relation_id: cmd.payload.relation_id },
  }),

  DELETE_RELATION: (cmd, snapshot) => {
    const rel = snapshot.relations.find((r) => r.id === cmd.payload.relation_id);
    if (!rel) return null;
    return {
      type: 'CREATE_RELATION',
      payload: {
        relation_id: rel.id,
        source_entity_id: rel.sourceId,
        target_entity_id: rel.targetId,
        source_column: rel.sourceColumn,
        target_column: rel.targetColumn,
        relation_type: rel.type,
      },
    };
  },

  UPDATE_RELATION: (cmd, snapshot) => {
    const rel = snapshot.relations.find((r) => r.id === cmd.payload.relation_id);
    if (!rel) return null;
    return {
      type: 'UPDATE_RELATION',
      payload: {
        relation_id: rel.id,
        relation_type: rel.type,
        source_column: rel.sourceColumn,
        target_column: rel.targetColumn,
      },
    };
  },

  LINK_ASSOCIATION_CLASS: (cmd, snapshot) => {
    const relId = cmd.payload.relation_id || cmd.payload.association_id;
    const rel = snapshot.relations.find((r) => r.id === relId);
    if (!rel || !rel.associationClassId) {
      return {
        type: 'UNLINK_ASSOCIATION_CLASS',
        payload: { relation_id: relId },
      };
    }
    return {
      type: 'LINK_ASSOCIATION_CLASS',
      payload: { relation_id: relId, class_id: rel.associationClassId },
    };
  },

  UNLINK_ASSOCIATION_CLASS: (cmd, snapshot) => {
    const relId = cmd.payload.relation_id || cmd.payload.association_id;
    const rel = snapshot.relations.find((r) => r.id === relId);
    if (!rel || !rel.associationClassId) return null;
    return {
      type: 'LINK_ASSOCIATION_CLASS',
      payload: { relation_id: relId, class_id: rel.associationClassId },
    };
  },

  RESIZE_ENTITY: (cmd, snapshot) => {
    const id = cmd.payload.entity_id ?? cmd.payload.class_id;
    const entity = snapshot.entities.find((e) => e.id === id);
    if (!entity) return null;
    return {
      type: 'RESIZE_ENTITY',
      payload: { entity_id: entity.id, width: entity.width, height: entity.height },
    };
  },

  RESIZE_CLASS: (cmd, snapshot) => {
    const id = cmd.payload.class_id ?? cmd.payload.entity_id;
    const entity = snapshot.entities.find((e) => e.id === id);
    if (!entity) return null;
    return {
      type: 'RESIZE_CLASS',
      payload: { class_id: entity.id, width: entity.width, height: entity.height },
    };
  },

  ASSIGN_CLASS_PACKAGE: (cmd, snapshot) => {
    const id = cmd.payload.entity_id ?? cmd.payload.class_id;
    const entity = snapshot.entities.find((e) => e.id === id);
    if (!entity) return null;
    return {
      type: 'ASSIGN_CLASS_PACKAGE',
      payload: { entity_id: entity.id, package_id: entity.packageId },
    };
  },

  CREATE_PACKAGE: (cmd) => ({
    type: 'DELETE_PACKAGE',
    payload: { package_id: cmd.payload.package_id },
  }),

  DELETE_PACKAGE: (cmd, snapshot) => {
    const pkg = snapshot.packages?.find((p) => p.id === cmd.payload.package_id);
    if (!pkg) return null;
    return {
      type: 'CREATE_PACKAGE',
      payload: { package_id: pkg.id, package_name: pkg.name },
    };
  },

  // UML aliases — delegate to ER equivalents
  CREATE_CLASS: (cmd) => ({
    type: 'DELETE_ENTITY',
    payload: { entity_id: cmd.payload.class_id ?? cmd.payload.entity_id },
  }),

  DELETE_CLASS: (cmd, snapshot) => {
    const id = cmd.payload.class_id ?? cmd.payload.entity_id;
    const entity = snapshot.entities.find((e) => e.id === id);
    if (!entity) return null;
    return {
      type: 'CREATE_ENTITY',
      payload: {
        entity_id: entity.id,
        entity_name: entity.name,
        columns: (entity.attributes || (entity as any).columns) as any,
        position: entity.position,
      },
    };
  },

  MOVE_CLASS: (cmd, snapshot) => {
    const id = cmd.payload.class_id ?? cmd.payload.entity_id;
    const entity = snapshot.entities.find((e) => e.id === id);
    if (!entity) return null;
    return {
      type: 'MOVE_ENTITY',
      payload: { entity_id: entity.id, position: entity.position },
    };
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the inverse of a command given the diagram state BEFORE that command
 * was applied.
 *
 * Returns null when the command type is not invertible (e.g. pure-ephemeral ops).
 */
export function invert(cmd: Command, snapshot: StateSnapshot): InverseResult | null {
  const fn = INVERSE_MAP[cmd.command_type];
  if (!fn) return null;
  try {
    return fn(cmd, snapshot);
  } catch {
    return null;
  }
}
