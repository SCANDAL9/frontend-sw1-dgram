import { Injectable, signal, computed } from '@angular/core';
import { DBEntity, DBRelation, DiagramState, DBAttribute } from '../models/diagram.model';
import { Command } from '../models/command';

@Injectable({ providedIn: 'root' })
export class DiagramService {
  readonly entities = signal<DBEntity[]>([]);
  readonly relations = signal<DBRelation[]>([]);
  readonly version = signal(0);

  readonly entityCount = computed(() => this.entities().length);
  readonly relationCount = computed(() => this.relations().length);

  // para creación directa Tabla1 → edición inline
  readonly pendingEditId = signal<string | null>(null);

  applyCommand(cmd: Command): void {
    const raw = cmd.payload as any;
    // normalize UML aliases to ER keys
    const p: any = {
      ...raw,
      entity_id: raw.entity_id ?? raw.class_id,
      entity_name: raw.entity_name ?? raw.class_name,
      columns: raw.columns ?? raw.attributes,
      column_name: raw.column_name ?? raw.attribute_name,
      column_changes: raw.column_changes ?? raw.attribute_changes,
      source_entity_id: raw.source_entity_id ?? raw.source_class_id,
      target_entity_id: raw.target_entity_id ?? raw.target_class_id,
      relation_type: raw.relation_type ?? raw.association_type,
      source_column: raw.source_column ?? raw.source_attribute,
      target_column: raw.target_column ?? raw.target_attribute,
      relation_id: raw.relation_id ?? raw.association_id,
    };
    const t = ((): Command['command_type'] => {
      const m: Record<string, Command['command_type']> = {
        CREATE_CLASS: 'CREATE_ENTITY', DELETE_CLASS: 'DELETE_ENTITY',
        UPDATE_CLASS: 'UPDATE_ENTITY', MOVE_CLASS: 'MOVE_ENTITY',
        ADD_ATTRIBUTE: 'ADD_COLUMN', UPDATE_ATTRIBUTE: 'UPDATE_COLUMN', DELETE_ATTRIBUTE: 'DELETE_COLUMN',
        CREATE_ASSOCIATION: 'CREATE_RELATION', UPDATE_ASSOCIATION: 'UPDATE_RELATION', DELETE_ASSOCIATION: 'DELETE_RELATION',
      };
      return (m[cmd.command_type] ?? cmd.command_type) as Command['command_type'];
    })();

    switch (t) {
      case 'CREATE_ENTITY':
        this.entities.update(es => {
          const id = p.entity_id!;
          const idx = es.findIndex(e => e.id === id);
          const next: DBEntity = {
            id,
            name: p.entity_name!,
            attributes: (p.columns || []) as DBAttribute[],
            position: p.position || { x: 100, y: 100 },
            elementType: p.element_type || p.elementType,
            stereotype: p.stereotype,
            isAbstract: !!(p.is_abstract || p.isAbstract),
          };
          if (idx >= 0) {
            const copy = [...es];
            copy[idx] = next;
            return copy;
          }
          return [...es, next];
        });
        break;

      case 'DELETE_ENTITY':
        this.entities.update(es => es.filter(e => e.id !== p.entity_id));
        this.relations.update(rs => rs.filter(r =>
          r.sourceId !== p.entity_id && r.targetId !== p.entity_id
        ));
        break;

      case 'UPDATE_ENTITY':
        this.entities.update(es => es.map(e =>
          e.id === p.entity_id
            ? {
                ...e,
                name: p.entity_name || e.name,
                stereotype: p.stereotype !== undefined ? p.stereotype : e.stereotype,
                elementType: (p.element_type || p.elementType) !== undefined ? (p.element_type || p.elementType) : e.elementType,
                isAbstract: p.is_abstract !== undefined ? p.is_abstract : (p.isAbstract !== undefined ? p.isAbstract : e.isAbstract),
              }
            : e
        ));
        break;

      case 'MOVE_ENTITY':
        this.entities.update(es => es.map(e =>
          e.id === p.entity_id
            ? { ...e, position: p.position! }
            : e
        ));
        break;

      case 'ADD_COLUMN': {
        // ensure unique column name within entity
        let newCol = p.column_changes as DBAttribute;
        this.entities.update(es => es.map(e => {
          if (e.id !== p.entity_id) return e;
          const names = new Set(e.attributes.map(a => a.name));
          let n = newCol.name;
          let c = 2;
          while (names.has(n)) { n = `${newCol.name}_${c++}`; }
          newCol = { ...newCol, name: n };
          return { ...e, attributes: [...e.attributes, newCol] };
        }));
        break;
      }

      case 'UPDATE_COLUMN': {
        const oldName = p.column_name as string;
        const changes = p.column_changes as Partial<DBAttribute>;
        const newName = (changes as any).name as string | undefined;
        this.entities.update(es => es.map(e =>
          e.id === p.entity_id
            ? {
                ...e,
                attributes: e.attributes.map(a =>
                  a.name === oldName
                    ? { ...a, ...changes }
                    : a
                ),
              }
            : e
        ));
        // keep relations in sync when column is renamed
        if (newName && newName !== oldName) {
          this.relations.update(rs => rs.map(r => {
            let nr = r;
            if (r.sourceId === p.entity_id && r.sourceColumn === oldName) nr = { ...nr, sourceColumn: newName };
            if (r.targetId === p.entity_id && r.targetColumn === oldName) nr = { ...nr, targetColumn: newName };
            return nr;
          }));
        }
        break;
      }

      case 'DELETE_COLUMN': {
        const delName = p.column_name as string;
        this.entities.update(es => es.map(e =>
          e.id === p.entity_id
            ? { ...e, attributes: e.attributes.filter(a => a.name !== delName) }
            : e
        ));
        // remove relations that pointed to deleted column (desync)
        this.relations.update(rs => rs.filter(r =>
          !( (r.sourceId === p.entity_id && r.sourceColumn === delName) ||
             (r.targetId === p.entity_id && r.targetColumn === delName) )
        ));
        break;
      }

      case 'CREATE_RELATION':
        this.relations.update(rs => [...rs, {
          id: p.relation_id || `rel-${Date.now()}`,
          sourceId: p.source_entity_id!,
          targetId: p.target_entity_id!,
          type: p.relation_type || '1:N',
          sourceColumn: p.source_column || '',
          targetColumn: p.target_column || '',
        }]);
        break;

      case 'UPDATE_RELATION':
        this.relations.update(rs => rs.map(r =>
          r.id === p.relation_id
            ? {
                ...r,
                type: p.relation_type || r.type,
                sourceColumn: p.source_column ?? r.sourceColumn,
                targetColumn: p.target_column ?? r.targetColumn,
              }
            : r
        ));
        break;

      case 'DELETE_RELATION':
        this.relations.update(rs => rs.filter(r => r.id !== p.relation_id));
        break;

      case 'LINK_ASSOCIATION_CLASS':
        this.relations.update(rs => rs.map(r =>
          r.id === (p.relation_id || p.association_id)
            ? { ...r, associationClassId: p.class_id || p.entity_id }
            : r
        ));
        break;

      case 'UNLINK_ASSOCIATION_CLASS':
        this.relations.update(rs => rs.map(r =>
          r.id === (p.relation_id || p.association_id)
            ? { ...r, associationClassId: null }
            : r
        ));
        break;
    }

    this.version.set(cmd.model_version);
  }

  loadState(state: DiagramState): void {
    let ents = (state.entities || state.classes || []) as DBEntity[];
    let rels = (state.relations || state.associations || []) as DBRelation[];
    // dedup column names within each entity (simple, no infinite loop)
    ents = ents.map(e => {
      const seen = new Set<string>();
      const attrs: DBAttribute[] = [];
      for (const a of (e.attributes as DBAttribute[])) {
        let name = a.name;
        let c = 2;
        while (seen.has(name)) { name = `${a.name}_${c++}`; }
        seen.add(name);
        attrs.push(name === a.name ? a : { ...a, name });
      }
      return { ...e, attributes: attrs };
    });
    // keep all relations — filtering is visual only via validRelations()
    this.entities.set(ents);
    this.relations.set(rels);
    this.version.set(state.version || 0);
  }

  getState(): DiagramState {
    const ents = this.entities();
    const rels = this.relations();
    return {
      entities: ents,
      relations: rels,
      classes: ents,
      associations: rels,
      version: this.version(),
    };
  }

  // UML facade — aliases para UI
  readonly classes = this.entities;
  readonly associations = this.relations;
  readonly classCount = this.entityCount;
  readonly associationCount = this.relationCount;
  getClass(id: string): DBEntity | undefined { return this.getEntity(id); }

  getEntity(id: string): DBEntity | undefined {
    return this.entities().find(e => e.id === id);
  }
}
