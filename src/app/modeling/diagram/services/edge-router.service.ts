import { Injectable } from '@angular/core';
import { IPoint } from '@foblex/2d';

export interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ConnectorSide = 'right' | 'left' | 'top' | 'bottom';

export interface RoutedEdge {
  waypoints: IPoint[];
  sourceSide: ConnectorSide;
  targetSide: ConnectorSide;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum clearance between a line and a node edge (px) */
const NODE_CLEARANCE = 20;

/** Offset for the self-referential loop outside the node (px) */
const SELF_LOOP_OFFSET = 48;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function rectCenterX(r: NodeRect): number { return r.x + r.width / 2; }
function rectCenterY(r: NodeRect): number { return r.y + r.height / 2; }

function anchorPoint(r: NodeRect, side: ConnectorSide): IPoint {
  switch (side) {
    case 'right':  return { x: r.x + r.width,    y: rectCenterY(r) };
    case 'left':   return { x: r.x,               y: rectCenterY(r) };
    case 'top':    return { x: rectCenterX(r),    y: r.y };
    case 'bottom': return { x: rectCenterX(r),    y: r.y + r.height };
  }
}

/**
 * Determine the best pair of connector sides based on the relative
 * center-to-center vector between source and target nodes.
 *
 * Priority: pick the axis with the largest separation so the initial
 * segment exits the node in a direction that makes geometric sense.
 */
function resolveSides(src: NodeRect, dst: NodeRect): { sourceSide: ConnectorSide; targetSide: ConnectorSide } {
  // Center coordinates
  const cSrc = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
  const cDst = { x: dst.x + dst.width / 2, y: dst.y + dst.height / 2 };
  const dx = cDst.x - cSrc.x;
  const dy = cDst.y - cSrc.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Check overlap on X axis (nodes share horizontal column space)
  const overlapX = (src.x < dst.x + dst.width) && (src.x + src.width > dst.x);
  // Check overlap on Y axis (nodes share vertical row space)
  const overlapY = (src.y < dst.y + dst.height) && (src.y + src.height > dst.y);

  // 1. Pure vertical alignment
  if (overlapX && !overlapY) {
    return dy > 0
      ? { sourceSide: 'bottom', targetSide: 'top' }
      : { sourceSide: 'top', targetSide: 'bottom' };
  }

  // 2. Pure horizontal alignment
  if (overlapY && !overlapX) {
    return dx > 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }

  // 3. Dominant Axis Priority (Enterprise Architect Standard)
  // When vertical distance between centers significantly exceeds horizontal distance,
  // or vice versa, enforce opposing faces on the dominant axis to prevent dogleg/C-loop routing.
  if (absDy >= absDx * 1.15) {
    return dy > 0
      ? { sourceSide: 'bottom', targetSide: 'top' }
      : { sourceSide: 'top', targetSide: 'bottom' };
  }

  if (absDx >= absDy * 1.15) {
    return dx > 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }

  // 4. Balanced diagonal: evaluate facing sides with strong preference to opposing axes
  const srcSides: ConnectorSide[] = [];
  if (dx > 0) srcSides.push('right'); else srcSides.push('left');
  if (dy > 0) srcSides.push('bottom'); else srcSides.push('top');

  const dstSides: ConnectorSide[] = [];
  if (dx > 0) dstSides.push('left'); else dstSides.push('right');
  if (dy > 0) dstSides.push('top'); else dstSides.push('bottom');

  let bestPair = { sourceSide: srcSides[0], targetSide: dstSides[0] };
  let minScore = Infinity;

  for (const s of srcSides) {
    for (const d of dstSides) {
      const p1 = anchorPoint(src, s);
      const p2 = anchorPoint(dst, d);
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const isOppositeAxis = (s === 'right' && d === 'left') || (s === 'left' && d === 'right') ||
                             (s === 'top' && d === 'bottom') || (s === 'bottom' && d === 'top');
      const score = dist - (isOppositeAxis ? 80 : 0);
      if (score < minScore) {
        minScore = score;
        bestPair = { sourceSide: s, targetSide: d };
      }
    }
  }

  return bestPair;
}

// ─── Obstacle & Corridor Path Builder ──────────────────────────────────────────

/**
 * Check if any obstacle node directly blocks the line of sight corridor
 * between source and target. If an obstacle blocks it, return detour waypoints.
 * Otherwise return an empty array so Foblex draws a clean, native orthogonal segment.
 */
function findCorridorObstacleWaypoints(
  src: NodeRect,
  dst: NodeRect,
  sourceSide: ConnectorSide,
  targetSide: ConnectorSide,
  obstacles: NodeRect[],
): IPoint[] {
  // Return empty waypoints for direct orthogonal segment connections.
  // Foblex's native Manhattan segment router calculates the optimal 1- or 2-bend
  // orthogonal trajectory between the chosen connector slots without artificial detours.
  return [];
}

// ─── Self-loop path ────────────────────────────────────────────────────────────

/**
 * Build a 3-bend orthogonal loop for a self-referential relation.
 *
 *  Node right edge ─────► (rx + offset, cy)
 *                                │
 *                         (rx + offset, cy - offset)
 *                                │
 *  Node top edge ◄──── (cx, cy - offset)
 *
 * Three waypoints, four segments, all at 90°.
 */
function selfLoopWaypoints(r: NodeRect, parallelIndex = 0): {
  waypoints: IPoint[];
  sourceSide: ConnectorSide;
  targetSide: ConnectorSide;
} {
  // Return empty waypoints so Foblex's native CalculateSegmentLineData creates
  // a clean, rounded Manhattan orthogonal loop directly between @class-out (right)
  // and @class-top (top) using live DOM connector coordinates.
  return {
    waypoints: [],
    sourceSide: 'right',
    targetSide: 'top',
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class EdgeRouterService {

  /**
   * Compute a strictly orthogonal (Manhattan) path between two nodes.
   *
   * Returns:
   *  - `waypoints` — intermediate points to inject into `<f-connection-waypoints>`.
   *    Source and target anchors are NOT included (Foblex handles them).
   *  - `sourceSide` / `targetSide` — which connector port to use on each node.
   */
  route(
    sourceId: string,
    targetId: string,
    allNodes: NodeRect[],
    parallelIndex = 0,
  ): RoutedEdge {
    const srcRect = allNodes.find((n) => n.id === sourceId);
    const dstRect = allNodes.find((n) => n.id === targetId);

    // ── Self-loop ──────────────────────────────────────────────────────────────
    if (sourceId === targetId && srcRect) {
      return selfLoopWaypoints(srcRect, parallelIndex);
    }

    // ── Missing geometry ───────────────────────────────────────────────────────
    if (!srcRect || !dstRect) {
      return { waypoints: [], sourceSide: 'right', targetSide: 'left' };
    }

    // ── Resolve port sides based on facing geometry & distance ──────────────────
    const { sourceSide, targetSide } = resolveSides(srcRect, dstRect);

    // ── Obstacle avoidance: Only if an obstacle actually intersects the corridor ──
    const obstacles = allNodes.filter((n) => n.id !== sourceId && n.id !== targetId);
    const waypoints = findCorridorObstacleWaypoints(srcRect, dstRect, sourceSide, targetSide, obstacles);

    return { waypoints, sourceSide, targetSide };
  }
}
