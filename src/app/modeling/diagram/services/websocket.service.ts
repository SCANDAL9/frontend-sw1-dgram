import { Injectable, inject, signal, computed } from '@angular/core';
import { DiagramService } from './diagram.service';
import { OutboxService } from './outbox.service';
import { environment } from '../../../../environments/environment';

export interface Peer {
  user_id: string;
  name: string;
  color: string;
}

export interface RemoteCursor {
  user_id: string;
  name: string;
  color: string;
  position: { x: number; y: number };
}

export interface ChatMessage {
  user_id: string;
  name: string;
  color: string;
  text: string;
  ts?: string;
}

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private ws: WebSocket | null = null;
  private diagram = inject(DiagramService);
  private outbox = inject(OutboxService);
  private handlers: ((msg: any) => void)[] = [];

  readonly online = signal(false);
  readonly userId = signal('');
  readonly boardId = signal('');
  readonly peers = signal<Peer[]>([]);
  readonly cursors = signal<Record<string, RemoteCursor>>({});
  readonly messages = signal<ChatMessage[]>([]);
  readonly peerCount = computed(() => this.peers().length);

  /** Remote selections: peer user_id → array of selected entity ids */
  readonly remoteSelections = signal<Record<string, string[]>>({});
  /** Remote editing: peer user_id → entity id currently being edited (or null) */
  readonly remoteEditing = signal<Record<string, string | null>>({});

  /** Eventos reactivos de agentes IA */
  readonly agentUiAction = signal<any | null>(null);
  readonly agentCommandsExecuted = signal<any | null>(null);


  /** Command ids already applied locally (echo of our own sends). */
  private appliedIds = new Set<string>();

  // ── Cursor throttle state (rAF batching) ─────────────────────────────────
  private _cursorBatch: { x: number; y: number } | null = null;
  private _cursorRafId: number | null = null;

  private _currentToken?: string;

  connect(boardId: string, userId: string, token?: string): void {
    this.boardId.set(boardId);
    this.userId.set(userId);
    if (token !== undefined) {
      this._currentToken = token;
    }
    this.appliedIds.clear();

    const tokenToUse = this._currentToken;
    const tokenQuery = tokenToUse ? `&token=${encodeURIComponent(tokenToUse)}` : '';
    const baseWs = environment.wsUrl || (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
      : 'ws://localhost:8000');
    this.ws = new WebSocket(
      `${baseWs}/ws/${boardId}?user_id=${userId}${tokenQuery}`
    );

    this.ws.onopen = () => {
      this.online.set(true);
      // Request authoritative state first; outbox flush happens after state:sync
      this.requestState();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this._dispatch(msg);
    };

    this.ws.onclose = (event) => {
      this.online.set(false);
      // No reconectar automáticamente si la sesión fue rechazada por falta o expiración de autenticación
      if (event.code === 4001 || event.code === 4003) {
        console.warn(`[WebSocketService] Conexión rechazada (código ${event.code}). Reconexión cancelada.`);
        return;
      }
      setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CLOSED) {
          this.connect(boardId, userId, this._currentToken);
        }
      }, 3000);
    };


    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send a command and enqueue it in the outbox for offline resilience.
   * The outbox entry is removed when the server ACKs with command:result success=true.
   */
  sendCommand(cmd: any): void {
    this.outbox.enqueue(cmd);
    this.send({ type: 'command:send', data: cmd });
  }

  requestState(): void {
    this.send({ type: 'state:request' });
  }

  onMessage(handler: (msg: any) => void): void {
    this.handlers.push(handler);
  }

  markApplied(commandId: string): void {
    this.appliedIds.add(commandId);
  }

  /**
   * Throttled cursor send via requestAnimationFrame.
   * Accumulates positions and emits only the latest one per animation frame,
   * capping cursor messages at ~60/sec regardless of native mousemove rate.
   */
  sendCursorThrottled(position: { x: number; y: number }): void {
    this._cursorBatch = position;
    if (this._cursorRafId !== null) return;
    this._cursorRafId = requestAnimationFrame(() => {
      if (this._cursorBatch) {
        this.send({ type: 'cursor:move', data: { position: this._cursorBatch } });
      }
      this._cursorBatch = null;
      this._cursorRafId = null;
    });
  }

  /** Legacy unthrottled cursor send — prefer sendCursorThrottled on canvas. */
  sendCursor(position: { x: number; y: number }): void {
    this.send({ type: 'cursor:move', data: { position } });
  }

  sendChat(text: string): void {
    this.send({
      type: 'chat:message',
      data: { text, ts: new Date().toISOString() },
    });
  }

  /**
   * Sends a live drag preview (ephemeral — never persisted in PostgreSQL).
   * Call on every mousemove during drag; sendCursorThrottled is applied internally.
   */
  sendDragLive(entityId: string, position: { x: number; y: number }): void {
    // Reuse the rAF throttle slot so drag previews also cap at ~60/sec
    this._cursorBatch = position;
    if (this._cursorRafId !== null) return;
    this._cursorRafId = requestAnimationFrame(() => {
      if (this._cursorBatch) {
        this.send({
          type: 'presence:drag',
          data: { entity_id: entityId, position: this._cursorBatch },
        });
      }
      this._cursorBatch = null;
      this._cursorRafId = null;
    });
  }

  /**
   * Broadcasts which entity ids this user has selected, and which (if any)
   * they are actively editing. Consumed by peers to render selection overlays.
   */
  sendSelection(selectedIds: string[], editingId: string | null = null): void {
    this.send({
      type: 'presence:selection',
      data: { selected_ids: selectedIds, editing_id: editingId },
    });
  }

  /**
   * Sincroniza el Session State del usuario con el SessionStateManager del backend
   * para que los agentes conozcan la selección, herramienta activa y viewport en tiempo real.
   */
  sendAgentSessionSync(state: {
    selected_element_id?: string | null;
    selected_element_type?: string | null;
    active_tool?: string;
    viewport?: { x: number; y: number; zoom: number };
    recent_action?: string | null;
  }): void {
    this.send({
      type: 'agent:sync_session',
      data: state,
    });
  }

  disconnect(): void {
    if (this._cursorRafId !== null) {
      cancelAnimationFrame(this._cursorRafId);
      this._cursorRafId = null;
    }
    this.ws?.close();
    this.ws = null;
    this.online.set(false);
    this.peers.set([]);
    this.cursors.set({});
    this.handlers = [];
  }

  private _dispatch(msg: any): void {
    switch (msg.type) {
      case 'state:sync':
        this.diagram.loadState(msg.data);
        // After rebasing server state, flush offline commands so the server
        // catches up with edits made during the disconnection.
        if (this.outbox.hasPending()) {
          this.outbox.flush((cmd) => {
            // Re-apply locally (diagram may have already applied these)
            this.markApplied(cmd.command_id);
            this.send({ type: 'command:send', data: cmd });
          });
        }
        break;

      case 'command:result': {
        // ACK from the server — remove from outbox
        const res = msg.data;
        if (res?.success && res?.command_id) {
          this.outbox.dequeue(res.command_id);
        }
        break;
      }

      case 'command:executed': {
        const cmd = msg.data;
        if (this.appliedIds.has(cmd.command_id)) {
          break;
        }
        this.diagram.applyCommand(cmd);
        break;
      }

      case 'presence:list':
        this.peers.set(
          (msg.data || []).filter((p: Peer) => p.user_id !== this.userId())
        );
        break;

      case 'user:joined':
        this.peers.update((peers) => {
          if (peers.some((p) => p.user_id === msg.data.user_id)) {
            return peers;
          }
          return [
            ...peers,
            {
              user_id: msg.data.user_id,
              name: msg.data.name ?? `User-${msg.data.user_id.slice(0, 6)}`,
              color: msg.data.color,
            },
          ];
        });
        break;

      case 'user:left':
        this.peers.update((peers) =>
          peers.filter((p) => p.user_id !== msg.data.user_id)
        );
        this.cursors.update((c) => {
          const next = { ...c };
          delete next[msg.data.user_id];
          return next;
        });
        this.remoteSelections.update((s) => {
          const next = { ...s };
          delete next[msg.data.user_id];
          return next;
        });
        this.remoteEditing.update((e) => {
          const next = { ...e };
          delete next[msg.data.user_id];
          return next;
        });
        break;

      case 'cursor:update': {
        const peer = this.peers().find((p) => p.user_id === msg.data.user_id);
        this.cursors.update((c) => ({
          ...c,
          [msg.data.user_id]: {
            user_id: msg.data.user_id,
            name: peer?.name ?? `User-${msg.data.user_id.slice(0, 6)}`,
            color: peer?.color ?? '#a6e3a1',
            position: msg.data.position,
          } as RemoteCursor,
        }));
        break;
      }

      case 'chat:message':
        this.messages.update((m) => [...m.slice(-199), msg.data]);
        break;

      case 'presence:selection': {
        const { user_id, selected_ids, editing_id } = msg.data;
        this.remoteSelections.update((s) => ({ ...s, [user_id]: selected_ids ?? [] }));
        this.remoteEditing.update((e) => ({ ...e, [user_id]: editing_id ?? null }));
        break;
      }

      case 'agent:ui_action':
        this.agentUiAction.set(msg.data);
        break;

      case 'agent:commands_executed':
        this.agentCommandsExecuted.set(msg.data);
        break;

      // presence:drag is purely visual — the canvas component handles it via onMessage()
    }

    this.handlers.forEach((h) => h(msg));
  }
}