import { Injectable, inject, signal } from '@angular/core';
import * as Y from 'yjs';
import { WebsocketService } from './websocket.service';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

@Injectable({ providedIn: 'root' })
export class YjsService {
  private ws = inject(WebsocketService);
  readonly doc = new Y.Doc();
  readonly isSynchronized = signal(false);

  constructor() {
    // 1. Escuchar actualizaciones locales de Yjs y enviarlas a través del WebSocket
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'remote') {
        return;
      }
      const b64 = uint8ArrayToBase64(update);
      this.ws.send({
        type: 'yjs:update',
        data: {
          update: b64,
        },
      });
    });

    // 2. Escuchar mensajes del WebSocket
    this.ws.onMessage((msg) => {
      if (msg.type === 'yjs:sync') {
        const stateB64 = msg.data?.state;
        if (stateB64) {
          try {
            const updateBytes = base64ToUint8Array(stateB64);
            Y.applyUpdate(this.doc, updateBytes, 'remote');
            this.isSynchronized.set(true);
          } catch (e) {
            console.error('[YjsService] Error applying initial Yjs sync state:', e);
          }
        }
      } else if (msg.type === 'yjs:update') {
        const updateB64 = msg.data?.update;
        if (updateB64) {
          try {
            const updateBytes = base64ToUint8Array(updateB64);
            Y.applyUpdate(this.doc, updateBytes, 'remote');
          } catch (e) {
            console.error('[YjsService] Error applying remote Yjs update:', e);
          }
        }
      }
    });
  }

  /**
   * Retorna un Y.Text compartido para edición colaborativa.
   */
  getText(fieldKey: string): Y.Text {
    return this.doc.getText(fieldKey);
  }

  /**
   * Retorna un Y.Map compartido.
   */
  getMap<T = any>(mapName: string): Y.Map<T> {
    return this.doc.getMap<T>(mapName);
  }

  /**
   * Retorna un Y.Array compartido.
   */
  getArray<T = any>(arrayName: string): Y.Array<T> {
    return this.doc.getArray<T>(arrayName);
  }

  /**
   * Solicita el snapshot canónico sincronizado desde el servidor.
   */
  requestSync(): void {
    this.ws.send({ type: 'yjs:sync_request' });
  }

  /**
   * Exporta el estado binario completo consolidado como string base64.
   */
  exportStateBase64(): string {
    const update = Y.encodeStateAsUpdate(this.doc);
    return uint8ArrayToBase64(update);
  }
}
