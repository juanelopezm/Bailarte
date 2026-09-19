// Pusher presence-channel auth + the single relay endpoint that every non-'join' WsMsg goes
// through (see client/src/net/realtime.ts). Server-authoritative message types (vote,
// battle-start, battle-lock) are validated against Redis-backed battle state before anything is
// broadcast; everything else (rtc signaling, control, upload-ready) is relayed as-is, matching
// the LAN ws hub's broadcast semantics.
import type { Request, Response } from 'express';
import { authorizeChannel, triggerMsg } from '../lib/pusherServer.ts';
import { getEntry } from '../lib/galleryStore.ts';
import { startBattle, castVote, lockMatch } from '../lib/battleStore.ts';
import type { BattleEntrant, WsMsg } from '../../../shared/types.ts';

export function pusherAuth(req: Request, res: Response) {
  const { socket_id: socketId, channel_name: channel, role } = req.body as {
    socket_id?: string;
    channel_name?: string;
    role?: string;
  };
  if (!socketId || !channel) {
    res.status(400).json({ error: 'missing socket_id or channel_name' });
    return;
  }
  const auth = authorizeChannel(socketId, channel, (role as 'host' | 'phone' | 'voter') ?? 'phone');
  res.json(auth);
}

export async function relay(req: Request, res: Response) {
  const { session, msg } = req.body as { session?: string; msg?: WsMsg };
  if (!session || !msg) {
    res.status(400).json({ error: 'missing session or msg' });
    return;
  }

  try {
    switch (msg.type) {
      case 'battle-start': {
        const entries = await Promise.all(msg.entryIds.map((id) => getEntry(id)));
        const entrants: BattleEntrant[] = entries
          .filter((e): e is NonNullable<typeof e> => !!e)
          .map((e) => ({ entryId: e.id, thumb: e.files.thumb ?? '', dancerName: e.dancerName }));
        await startBattle(session, entrants);
        break;
      }
      case 'vote':
        await castVote(session, msg.matchId, msg.pick, msg.deviceToken);
        break;
      case 'battle-lock':
        await lockMatch(session);
        break;
      default:
        await triggerMsg(session, msg);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[relay] failed', err);
    res.status(500).json({ error: 'relay failed' });
  }
}
