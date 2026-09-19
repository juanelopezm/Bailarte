// Typed WebSocket client with auto-reconnect, talking to /ws on this same origin (proxied to
// the Express+ws server). See plan §A (single origin) and §K (phone signaling).
import type { WsMsg } from '@shared/types.ts';

export type WsListener = (msg: WsMsg) => void;

const DEVICE_TOKEN_KEY = 'danza-device-token';

export function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<WsListener>();
  private reconnectDelay = 500;
  private closedByUser = false;
  private connectionListeners = new Set<(connected: boolean) => void>();

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);

    this.ws.addEventListener('open', () => {
      this.reconnectDelay = 500;
      this.connectionListeners.forEach((cb) => cb(true));
    });

    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMsg;
        this.listeners.forEach((cb) => cb(msg));
      } catch {
        // ignore malformed frames
      }
    });

    this.ws.addEventListener('close', () => {
      this.connectionListeners.forEach((cb) => cb(false));
      if (!this.closedByUser) {
        setTimeout(() => this.open(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.7, 8000);
      }
    });
  }

  send(msg: WsMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(cb: WsListener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onConnectionChange(cb: (connected: boolean) => void) {
    this.connectionListeners.add(cb);
    return () => this.connectionListeners.delete(cb);
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}
