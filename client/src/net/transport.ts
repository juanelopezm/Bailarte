// Picks the realtime transport: the LAN WebSocket hub for local party mode (`npm run dev`), or
// Pusher for the Vercel-hosted deployment — whichever this build was configured for. Every
// screen that talks to the network should construct its client through this, never `new
// WsClient()` / `new RealtimeClient()` directly, so the two deployment modes stay interchangeable.
import { WsClient, type WsListener } from './ws.ts';
import { RealtimeClient } from './realtime.ts';
import type { WsMsg } from '@shared/types.ts';

export interface RealtimeTransport {
  connect(): void;
  send(msg: WsMsg): void;
  onMessage(cb: WsListener): () => void;
  onConnectionChange(cb: (connected: boolean) => void): () => void;
  close(): void;
}

export function createRealtimeClient(): RealtimeTransport {
  return import.meta.env.VITE_PUSHER_KEY ? new RealtimeClient() : new WsClient();
}

// Same signal used everywhere else that needs to know which deployment mode this build is:
// LAN party mode has no Pusher key and talks to the local Express server directly (small
// payloads, no function body limit); the hosted mode needs Vercel Blob's client-upload path for
// anything that could exceed a serverless function's ~4.5MB request body.
export const isHosted = !!import.meta.env.VITE_PUSHER_KEY;
