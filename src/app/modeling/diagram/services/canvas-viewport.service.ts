import { Injectable, signal } from '@angular/core';
import { FCanvasComponent, FZoomDirective } from '@foblex/flow';

@Injectable({
  providedIn: 'root',
})
export class CanvasViewportService {
  zoomPercent = signal(100);
  canvasPan = signal({ x: 0, y: 0 });
  canvasScale = signal(1);
  isPanning = signal(false);
  rightClickBox = signal<{ x: number; y: number; w: number; h: number } | null>(null);

  lineType = signal<'segment' | 'bezier' | 'straight' | 'adaptive-curve'>('segment');
  gridType = signal<'dots' | 'lines' | 'none'>('dots');
  showMinimap = signal(true);

  panBy(dx: number, dy: number, canvas?: FCanvasComponent): void {
    const current = this.canvasPan();
    const nextPan = { x: current.x + dx, y: current.y + dy };
    if (canvas) {
      (canvas as any)._setPosition?.(nextPan);
      canvas.redraw();
      (canvas as any).emitCanvasChangeEvent?.();
    }
    this.canvasPan.set(nextPan);
  }

  syncZoom(zoom?: FZoomDirective): void {
    const value = zoom?.getZoomValue();
    if (typeof value === 'number') {
      this.zoomPercent.set(Math.round(value * 100));
    }
  }

  zoomIn(zoom?: FZoomDirective): void {
    zoom?.zoomIn();
    this.syncZoom(zoom);
  }

  zoomOut(zoom?: FZoomDirective): void {
    zoom?.zoomOut();
    this.syncZoom(zoom);
  }

  zoomReset(zoom?: FZoomDirective): void {
    zoom?.reset();
    this.syncZoom(zoom);
  }

  fitToScreen(canvas?: FCanvasComponent, zoom?: FZoomDirective): void {
    canvas?.fitToScreen(undefined, true, false);
    this.syncZoom(zoom);
  }
}
