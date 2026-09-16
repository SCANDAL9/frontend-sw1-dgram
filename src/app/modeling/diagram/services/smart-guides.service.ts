import { Injectable } from '@angular/core';

export interface GuideLine {
  type: 'horizontal' | 'vertical';
  pos: number;      // X coordinate for vertical, Y coordinate for horizontal
  start: number;    // Segment start
  end: number;      // Segment end
}

export interface NodeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

@Injectable({ providedIn: 'root' })
export class SmartGuidesService {
  private readonly SNAP_THRESHOLD = 8; // pixels

  /**
   * Calculates magnetic snapping and alignment guidelines for a dragged node
   * against all target nodes in the diagram.
   */
  calculateSnap(
    draggedId: string,
    proposedPos: { x: number; y: number },
    nodeDimensions: { w: number; h: number },
    otherNodes: NodeRect[]
  ): SnapResult {
    let snappedX = proposedPos.x;
    let snappedY = proposedPos.y;
    const guides: GuideLine[] = [];

    const dW = nodeDimensions.w;
    const dH = nodeDimensions.h;

    const dragLeft = proposedPos.x;
    const dragCenterX = proposedPos.x + dW / 2;
    const dragRight = proposedPos.x + dW;

    const dragTop = proposedPos.y;
    const dragCenterY = proposedPos.y + dH / 2;
    const dragBottom = proposedPos.y + dH;

    let minDiffX = this.SNAP_THRESHOLD + 1;
    let bestSnapX: number | null = null;
    let bestGuideX: GuideLine | null = null;

    let minDiffY = this.SNAP_THRESHOLD + 1;
    let bestSnapY: number | null = null;
    let bestGuideY: GuideLine | null = null;

    for (const target of otherNodes) {
      if (target.id === draggedId) continue;

      const tLeft = target.x;
      const tCenterX = target.x + target.w / 2;
      const tRight = target.x + target.w;

      const tTop = target.y;
      const tCenterY = target.y + target.h / 2;
      const tBottom = target.y + target.h;

      // ── Horizontal snapping (Y axis alignment) ───────────────────────────
      // 1. Top to Top
      if (Math.abs(dragTop - tTop) < minDiffY) {
        minDiffY = Math.abs(dragTop - tTop);
        bestSnapY = tTop;
        bestGuideY = {
          type: 'horizontal',
          pos: tTop,
          start: Math.min(dragLeft, tLeft) - 20,
          end: Math.max(dragRight, tRight) + 20,
        };
      }
      // 2. Center to Center
      if (Math.abs(dragCenterY - tCenterY) < minDiffY) {
        minDiffY = Math.abs(dragCenterY - tCenterY);
        bestSnapY = tCenterY - dH / 2;
        bestGuideY = {
          type: 'horizontal',
          pos: tCenterY,
          start: Math.min(dragLeft, tLeft) - 20,
          end: Math.max(dragRight, tRight) + 20,
        };
      }
      // 3. Bottom to Bottom
      if (Math.abs(dragBottom - tBottom) < minDiffY) {
        minDiffY = Math.abs(dragBottom - tBottom);
        bestSnapY = tBottom - dH;
        bestGuideY = {
          type: 'horizontal',
          pos: tBottom,
          start: Math.min(dragLeft, tLeft) - 20,
          end: Math.max(dragRight, tRight) + 20,
        };
      }

      // ── Vertical snapping (X axis alignment) ─────────────────────────────
      // 1. Left to Left
      if (Math.abs(dragLeft - tLeft) < minDiffX) {
        minDiffX = Math.abs(dragLeft - tLeft);
        bestSnapX = tLeft;
        bestGuideX = {
          type: 'vertical',
          pos: tLeft,
          start: Math.min(dragTop, tTop) - 20,
          end: Math.max(dragBottom, tBottom) + 20,
        };
      }
      // 2. Center to Center
      if (Math.abs(dragCenterX - tCenterX) < minDiffX) {
        minDiffX = Math.abs(dragCenterX - tCenterX);
        bestSnapX = tCenterX - dW / 2;
        bestGuideX = {
          type: 'vertical',
          pos: tCenterX,
          start: Math.min(dragTop, tTop) - 20,
          end: Math.max(dragBottom, tBottom) + 20,
        };
      }
      // 3. Right to Right
      if (Math.abs(dragRight - tRight) < minDiffX) {
        minDiffX = Math.abs(dragRight - tRight);
        bestSnapX = tRight - dW;
        bestGuideX = {
          type: 'vertical',
          pos: tRight,
          start: Math.min(dragTop, tTop) - 20,
          end: Math.max(dragBottom, tBottom) + 20,
        };
      }
    }

    if (bestSnapX !== null && minDiffX <= this.SNAP_THRESHOLD) {
      snappedX = bestSnapX;
      if (bestGuideX) guides.push(bestGuideX);
    }
    if (bestSnapY !== null && minDiffY <= this.SNAP_THRESHOLD) {
      snappedY = bestSnapY;
      if (bestGuideY) guides.push(bestGuideY);
    }

    return { x: snappedX, y: snappedY, guides };
  }
}
