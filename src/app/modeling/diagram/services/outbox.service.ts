/**
 * outbox.service.ts — Offline-resilient command queue backed by localStorage.
 *
 * Problem: when the WebSocket connection drops, any command the user types is
 * sent to the void and lost. On reconnect, a state:sync from the server
 * overwrites any local edits made during the outage.
 *
 * Solution (Outbox Pattern):
 *   1. Every command is enqueued in localStorage BEFORE being sent over WS.
 *   2. When the server ACKs (command:result success), the command is dequeued.
 *   3. On reconnect, pending commands in the outbox are flushed to the server.
 *      The server's board_history has command_id UNIQUE, so re-sending an
 *      already-persisted command is a safe no-op (ON CONFLICT DO NOTHING).
 *
 * The local DiagramService state is the optimistic truth. The server state
 * (received via state:sync) is rebased under pending outbox commands so the
 * user never sees a regression of their own work.
 */

import { Injectable } from '@angular/core';
import { Command } from '../models/command';

const OUTBOX_KEY = 'dgram:outbox';
const MAX_OUTBOX_SIZE = 200;

@Injectable({ providedIn: 'root' })
export class OutboxService {

  /** Returns all pending (un-ACKed) commands in insertion order. */
  getAll(): Command[] {
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      return raw ? (JSON.parse(raw) as Command[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Persist a command into the outbox.
   * Called immediately after the command is applied locally, before it is
   * sent to the server. Capped at MAX_OUTBOX_SIZE to prevent unbounded growth.
   */
  enqueue(cmd: Command): void {
    try {
      const queue = this.getAll();
      if (queue.some((c) => c.command_id === cmd.command_id)) return; // idempotent
      queue.push(cmd);
      if (queue.length > MAX_OUTBOX_SIZE) {
        // Drop oldest entries: the server state will cover them on next sync
        queue.splice(0, queue.length - MAX_OUTBOX_SIZE);
      }
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
    } catch {
      // localStorage may be unavailable (private mode / quota) — degrade silently
    }
  }

  /**
   * Remove a command from the outbox once the server has acknowledged it.
   * Called when a command:result with success=true is received.
   */
  dequeue(commandId: string): void {
    try {
      const queue = this.getAll().filter((c) => c.command_id !== commandId);
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
    } catch {
      // no-op
    }
  }

  /** Returns true if there are pending commands waiting to be ACKed. */
  hasPending(): boolean {
    return this.getAll().length > 0;
  }

  /**
   * Flush all pending commands by calling the provided sender function.
   * Typically called on WebSocket reconnect, after the server state has
   * been received and rebased.
   *
   * Commands are flushed in insertion order to preserve causal ordering.
   */
  flush(send: (cmd: Command) => void): void {
    for (const cmd of this.getAll()) {
      send(cmd);
    }
  }

  /** Clear the entire outbox (e.g. on explicit logout or board change). */
  clear(): void {
    try {
      localStorage.removeItem(OUTBOX_KEY);
    } catch {
      // no-op
    }
  }
}
