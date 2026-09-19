// Pusher server client (plan §K/§L realtime, adapted for serverless — see net/realtime.ts on
// the client side for the matching adapter). One presence channel per session code stands in
// for the ws hub's room/peer tracking.
import Pusher from 'pusher';
import type { WsMsg, WsRole } from '../../shared/types.ts';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.VITE_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.VITE_PUSHER_CLUSTER!,
  useTLS: true,
});

export function channelFor(session: string): string {
  return `presence-session-${session}`;
}

export async function triggerMsg(session: string, msg: WsMsg) {
  await pusher.trigger(channelFor(session), 'msg', msg);
}

export function authorizeChannel(socketId: string, channel: string, role: WsRole) {
  // user_id just needs to be unique per connection — Pusher uses it to dedupe presence members.
  return pusher.authorizeChannel(socketId, channel, {
    user_id: `${role}-${Math.random().toString(36).slice(2)}`,
    user_info: { role },
  });
}
