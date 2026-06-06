// @ts-nocheck
"use client";

/**
 * SupabaseYjsProvider
 *
 * A lightweight Yjs provider that uses Supabase Realtime as the transport layer.
 *
 * Transport:
 *   - `broadcast` channel event `yjs-update` — carries binary Yjs state updates
 *   - `presence` — carries awareness (cursor position, user info) for each peer
 *
 * Limitations vs. a WebSocket server:
 *   - No persistent state on the wire; latecomers bootstrap from Supabase DB
 *   - Supabase Realtime has a 1 MB broadcast payload limit (fine for code diffs)
 *   - Presence state is limited to the Supabase presence payload size (~10 KB)
 */

import * as Y from "yjs";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

export interface AwarenessCursor {
  file: string;
  line: number;
  column: number;
  /** Selection range, if any */
  selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

export interface AwarenessState {
  user: CollabUser;
  cursor?: AwarenessCursor;
  /** ISO timestamp — updated periodically so stale peers can be detected */
  heartbeat?: string;
}

export type AwarenessChangeCallback = (states: Map<string, AwarenessState>) => void;

// ── Constants ─────────────────────────────────────────────────────────────────

const UPDATE_EVENT   = "yjs-update";
const SYNC_EVENT     = "yjs-sync-req";
const SYNC_RSP_EVENT = "yjs-sync-rsp";
const HEARTBEAT_MS   = 15_000;

// ── Provider ──────────────────────────────────────────────────────────────────

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;

  /** All currently connected peer awareness states (keyed by presence key) */
  readonly awareness: Map<string, AwarenessState> = new Map();

  private channel: RealtimeChannel;
  private localUser: CollabUser;
  private localCursor: AwarenessCursor | undefined;
  private presenceKey: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyFns: Array<() => void> = [];
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private _synced = false;

  constructor(
    doc: Y.Doc,
    roomName: string,
    supabase: SupabaseClient,
    user: CollabUser
  ) {
    this.doc = doc;
    this.localUser = user;
    this.presenceKey = `${user.id}-${Math.random().toString(36).slice(2, 7)}`;

    // ── Supabase Realtime channel ───────────────────────────────────────────
    this.channel = supabase.channel(`collab:${roomName}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence:  { key: this.presenceKey },
      },
    });

    // ── Handle incoming Yjs update broadcasts ───────────────────────────────
    this.channel.on(
      "broadcast",
      { event: UPDATE_EVENT },
      ({ payload }: { payload: { update: number[]; origin: string } }) => {
        if (!payload?.update) return;
        const update = new Uint8Array(payload.update);
        // Apply with "remote" origin so our own update handler doesn't re-broadcast
        Y.applyUpdate(this.doc, update, "remote");
      }
    );

    // ── Handle sync request: peer joined and wants our full state ───────────
    this.channel.on(
      "broadcast",
      { event: SYNC_EVENT },
      ({ payload }: { payload: { targetKey: string } }) => {
        if (payload?.targetKey && payload.targetKey !== this.presenceKey) return;
        const stateVector = Y.encodeStateAsUpdate(this.doc);
        void this.channel.send({
          type: "broadcast",
          event: SYNC_RSP_EVENT,
          payload: { update: Array.from(stateVector), forKey: payload.targetKey },
        });
      }
    );

    // ── Handle sync response: another peer sends us their full state ─────────
    this.channel.on(
      "broadcast",
      { event: SYNC_RSP_EVENT },
      ({ payload }: { payload: { update: number[]; forKey: string } }) => {
        if (payload?.forKey !== this.presenceKey) return;
        if (!payload?.update) return;
        Y.applyUpdate(this.doc, new Uint8Array(payload.update), "sync-response");
        this._synced = true;
        this.emit("synced");
      }
    );

    // ── Presence: sync → rebuild awareness map ──────────────────────────────
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel.presenceState<{ state: AwarenessState }>();
      this.awareness.clear();
      for (const [key, presences] of Object.entries(state)) {
        if (key === this.presenceKey) continue; // skip self
        const latest = (presences as Array<{ state: AwarenessState }>)[0];
        if (latest?.state) this.awareness.set(key, latest.state);
      }
      this.emit("awareness-change", this.awareness);
    });

    this.channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const p of leftPresences as Array<{ key: string }>) {
        this.awareness.delete(p.key);
      }
      this.emit("awareness-change", this.awareness);
    });

    // ── Forward local Yjs updates to remote peers ───────────────────────────
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || origin === "sync-response") return;
      void this.channel.send({
        type: "broadcast",
        event: UPDATE_EVENT,
        payload: { update: Array.from(update), origin: this.presenceKey },
      });
    };
    this.doc.on("update", updateHandler);
    this.destroyFns.push(() => this.doc.off("update", updateHandler));

    // ── Subscribe and bootstrap ─────────────────────────────────────────────
    this.channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;

      // Track our presence
      await this.channel.track({
        state: this.buildAwarenessState(),
      });

      // Request the current document state from any peer who's already here
      await this.channel.send({
        type: "broadcast",
        event: SYNC_EVENT,
        payload: { targetKey: "" }, // empty = broadcast to all
      });

      // If nobody responds in 1 s, assume we're the first (already synced)
      setTimeout(() => {
        if (!this._synced) {
          this._synced = true;
          this.emit("synced");
        }
      }, 1000);
    });

    // ── Heartbeat to keep presence alive ────────────────────────────────────
    this.heartbeatTimer = setInterval(() => {
      void this.channel.track({ state: this.buildAwarenessState() });
    }, HEARTBEAT_MS);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Update the local cursor position and broadcast via presence */
  setCursor(cursor: AwarenessCursor | undefined) {
    this.localCursor = cursor;
    void this.channel.track({ state: this.buildAwarenessState() });
  }

  /** Whether the initial state sync has completed */
  get synced() { return this._synced; }

  /** Clean up the provider: unsubscribe channel, stop heartbeat, remove listeners */
  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.destroyFns.forEach((fn) => fn());
    void this.channel.unsubscribe();
    this.listeners.clear();
  }

  // ── Event emitter ──────────────────────────────────────────────────────────

  on(event: "awareness-change", cb: AwarenessChangeCallback): void;
  on(event: "synced", cb: () => void): void;
  on(event: string, cb: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildAwarenessState(): AwarenessState {
    return {
      user: this.localUser,
      cursor: this.localCursor,
      heartbeat: new Date().toISOString(),
    };
  }
}

// ── Utility: deterministic colour from user ID ────────────────────────────────

const COLLAB_COLORS = [
  "#7c3aed", "#2563eb", "#059669", "#d97706",
  "#dc2626", "#db2777", "#0891b2", "#65a30d",
];

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return COLLAB_COLORS[hash % COLLAB_COLORS.length];
}
