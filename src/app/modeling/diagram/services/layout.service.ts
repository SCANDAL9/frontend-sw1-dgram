import { Injectable, inject } from '@angular/core';
import { DiagramService } from './diagram.service';
import { CommandService } from './command.service';
import { DBEntity, DBRelation } from '../models/diagram.model';

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 160;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private diagram = inject(DiagramService);
  private cmd = inject(CommandService);

  /**
   * Align selected entities to the leftmost edge.
   */
  alignLeft(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const minX = Math.min(...entities.map((e) => e.position.x));
    for (const e of entities) {
      if (e.position.x !== minX) {
        this.cmd.moveEntity(e.id, { x: minX, y: e.position.y });
      }
    }
  }

  /**
   * Align selected entities to horizontal center.
   */
  alignCenterH(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const centers = entities.map((e) => e.position.x + DEFAULT_NODE_WIDTH / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    for (const e of entities) {
      const newX = Math.round(avgCenter - DEFAULT_NODE_WIDTH / 2);
      if (e.position.x !== newX) {
        this.cmd.moveEntity(e.id, { x: newX, y: e.position.y });
      }
    }
  }

  /**
   * Align selected entities to the rightmost edge.
   */
  alignRight(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const maxRight = Math.max(...entities.map((e) => e.position.x + DEFAULT_NODE_WIDTH));
    for (const e of entities) {
      const newX = maxRight - DEFAULT_NODE_WIDTH;
      if (e.position.x !== newX) {
        this.cmd.moveEntity(e.id, { x: newX, y: e.position.y });
      }
    }
  }

  /**
   * Align selected entities to the topmost edge.
   */
  alignTop(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const minY = Math.min(...entities.map((e) => e.position.y));
    for (const e of entities) {
      if (e.position.y !== minY) {
        this.cmd.moveEntity(e.id, { x: e.position.x, y: minY });
      }
    }
  }

  /**
   * Align selected entities to vertical center.
   */
  alignCenterV(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const centers = entities.map((e) => e.position.y + DEFAULT_NODE_HEIGHT / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    for (const e of entities) {
      const newY = Math.round(avgCenter - DEFAULT_NODE_HEIGHT / 2);
      if (e.position.y !== newY) {
        this.cmd.moveEntity(e.id, { x: e.position.x, y: newY });
      }
    }
  }

  /**
   * Align selected entities to the bottommost edge.
   */
  alignBottom(entityIds: string[]): void {
    if (entityIds.length < 2) return;
    const entities = this._getEntities(entityIds);
    const maxBottom = Math.max(...entities.map((e) => e.position.y + DEFAULT_NODE_HEIGHT));
    for (const e of entities) {
      const newY = maxBottom - DEFAULT_NODE_HEIGHT;
      if (e.position.y !== newY) {
        this.cmd.moveEntity(e.id, { x: e.position.x, y: newY });
      }
    }
  }

  /**
   * Distribute selected entities evenly along horizontal axis.
   */
  distributeHorizontally(entityIds: string[]): void {
    if (entityIds.length < 3) return;
    const entities = this._getEntities(entityIds).sort((a, b) => a.position.x - b.position.x);
    const firstX = entities[0].position.x;
    const lastX = entities[entities.length - 1].position.x;
    const totalSpan = lastX - firstX;
    const step = totalSpan / (entities.length - 1);

    for (let i = 1; i < entities.length - 1; i++) {
      const newX = Math.round(firstX + i * step);
      if (entities[i].position.x !== newX) {
        this.cmd.moveEntity(entities[i].id, { x: newX, y: entities[i].position.y });
      }
    }
  }

  /**
   * Distribute selected entities evenly along vertical axis.
   */
  distributeVertically(entityIds: string[]): void {
    if (entityIds.length < 3) return;
    const entities = this._getEntities(entityIds).sort((a, b) => a.position.y - b.position.y);
    const firstY = entities[0].position.y;
    const lastY = entities[entities.length - 1].position.y;
    const totalSpan = lastY - firstY;
    const step = totalSpan / (entities.length - 1);

    for (let i = 1; i < entities.length - 1; i++) {
      const newY = Math.round(firstY + i * step);
      if (entities[i].position.y !== newY) {
        this.cmd.moveEntity(entities[i].id, { x: entities[i].position.x, y: newY });
      }
    }
  }

  /**
   * Automatic hierarchical layout (Sugiyama-inspired layer arrangement).
   * Organizes base classes/interfaces at top layers and dependent classes below.
   */
  autoLayout(): void {
    const entities = [...this.diagram.entities()];
    const relations = this.diagram.relations();
    if (entities.length === 0) return;

    // Build dependency graph
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    entities.forEach((e) => {
      inDegree.set(e.id, 0);
      outEdges.set(e.id, []);
    });

    relations.forEach((r) => {
      // For Generalization/Realization: source is child, target is parent
      // Place target (parent) above source (child)
      const isHierarchy = r.type?.toLowerCase().includes('general') || r.type?.toLowerCase().includes('realiz') || r.type?.toLowerCase().includes('inherit');
      const from = isHierarchy ? r.targetId : r.sourceId;
      const to = isHierarchy ? r.sourceId : r.targetId;

      if (outEdges.has(from) && inDegree.has(to)) {
        outEdges.get(from)!.push(to);
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
      }
    });

    // Assign layers via topological traversal
    const layers: string[][] = [];
    const assigned = new Set<string>();
    let currentLayer = entities.filter((e) => (inDegree.get(e.id) || 0) === 0).map((e) => e.id);

    if (currentLayer.length === 0) {
      currentLayer = [entities[0].id];
    }

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      currentLayer.forEach((id) => assigned.add(id));

      const nextLayerSet = new Set<string>();
      currentLayer.forEach((id) => {
        (outEdges.get(id) || []).forEach((targetId) => {
          if (!assigned.has(targetId)) {
            nextLayerSet.add(targetId);
          }
        });
      });

      // If no dependencies found but unassigned nodes remain, pick next unassigned batch
      if (nextLayerSet.size === 0 && assigned.size < entities.length) {
        const remaining = entities.filter((e) => !assigned.has(e.id)).map((e) => e.id);
        if (remaining.length > 0) {
          nextLayerSet.add(remaining[0]);
        }
      }

      currentLayer = Array.from(nextLayerSet);
    }

    // Compute positions for each layer
    const LAYER_GAP_Y = 160;
    const NODE_GAP_X = 60;
    const START_X = 100;
    const START_Y = 80;

    layers.forEach((layer, layerIndex) => {
      const y = START_Y + layerIndex * (DEFAULT_NODE_HEIGHT + LAYER_GAP_Y);
      const totalWidth = layer.length * DEFAULT_NODE_WIDTH + (layer.length - 1) * NODE_GAP_X;
      let startX = Math.max(START_X, START_X + (800 - totalWidth) / 2);

      layer.forEach((entityId, nodeIndex) => {
        const x = startX + nodeIndex * (DEFAULT_NODE_WIDTH + NODE_GAP_X);
        this.cmd.moveEntity(entityId, { x: Math.round(x), y: Math.round(y) });
      });
    });
  }

  private _getEntities(ids: string[]): DBEntity[] {
    const set = new Set(ids);
    return this.diagram.entities().filter((e) => set.has(e.id));
  }
}
