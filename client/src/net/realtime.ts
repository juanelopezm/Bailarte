// Pusher-based realtime transport for the Vercel-hosted deployment — a drop-in for WsClient
// (same connect/send/onMessage/onConnectionChange/close shape) so every component that talks
// to the network (StageScreen, PhoneHome, PhoneVote, BattleScreen) works unchanged regardless
// of which transport createRealtimeClient() picks. See net/transport.ts for the selection logic.
//
// Design: a Pusher presence channel per session code stands in for the ws hub's room/peer
// tracking (pusher:subscription_succeeded / member_added / member_removed replace our own
// 'joined' / 'peer-joined' / 'peer-left' messages). Every other WsMsg is relayed through a
// single POST /api/relay, which validates server-authoritative ones (vote, battle-start,
// battle-lock) against Redis-backed battle state and re-broadcasts via Pusher's server SDK.
import Pusher, { type PresenceChannel } from 'pusher-js';
import type { WsMsg, WsRole } from '@shared/types.ts';
import type { WsListener } from './ws.ts';

interface PresenceMember {
  id: string;
  info?: { role?: WsRole };
}

export class RealtimeClient {
  private pusher: Pusher | null = null;
  private channel: PresenceChannel | null = null;
  private listeners = new Set<WsListener>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  private session = '';
  private role: WsRole = 'phone';

  // Every caller follows WsClient's contract: register onConnectionChange, THEN call connect(),
  // and only send({type:'join', ...}) once that callback fires true. A Pusher presence-channel
  // subscription needs the role for its auth request — but if connect() did nothing until join
  // arrived, and join never arrives until onConnectionChange fires, nothing would ever happen.
  // The fix: open the underlying Pusher socket immediately (role-independent), and defer only
  // the per-channel auth lookup via a customHandler that reads `this.role` at subscribe time,
  // which by then join() has already set.
  connect() {
    const key = import.meta.env.VITE_PUSHER_KEY as string;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER as string;
    this.pusher = new Pusher(key, {
      cluster,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          fetch('/api/pusher-auth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ socket_id: socketId, channel_name: channelName, role: this.role }),
          })
            .then((res) => res.json())
            .then((data) => callback(null, data))
            .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), null));
        },
      },
    });

    this.pusher.connection.bind('state_change', (states: { current: string }) => {
      this.connectionListeners.forEach((cb) => cb(states.current === 'connected'));
    });
  }

  send(msg: WsMsg) {
    if (msg.type === 'join') {
      this.session = msg.session;
      this.role = msg.role;
      this.subscribe();
      return;
    }
    fetch('/api/relay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: this.session, msg }),
    }).catch((err) => console.warn('[realtime] relay send failed', err));
  }

  private subscribe() {
    if (!this.pusher) return;
    const channel = this.pusher.subscribe(`presence-session-${this.session}`) as PresenceChannel;
    this.channel = channel;

    channel.bind('pusher:subscription_succeeded', (members: { count: number }) => {
      this.emit({ type: 'joined', session: this.session, role: this.role, peers: members.count });
    });
    channel.bind('pusher:member_added', (member: PresenceMember) => {
      if (member.info?.role) this.emit({ type: 'peer-joined', role: member.info.role });
    });
    channel.bind('pusher:member_removed', (member: PresenceMember) => {
      if (member.info?.role) this.emit({ type: 'peer-left', role: member.info.role });
    });
    channel.bind('msg', (msg: WsMsg) => this.emit(msg));
  }

  private emit(msg: WsMsg) {
    this.listeners.forEach((cb) => cb(msg));
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
    this.channel?.unsubscribe();
    this.pusher?.disconnect();
  }
}
