// WebSocket hub: session rooms for phone join (camera/remote/upload/voter roles), signaling
// relay, and battle broadcast. See plan §K (phone signaling) and §L (battle).
import type { WebSocket, WebSocketServer } from 'ws';
import type { WsMsg, WsRole } from '../../shared/types.ts';
import { startBattle, castVote, lockMatch, getBattleState } from './battle.ts';
import { getEntry } from './gallery.ts';

interface Peer {
  ws: WebSocket;
  role: WsRole;
}

interface Room {
  code: string;
  peers: Set<Peer>;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(code: string): Room {
  let room = rooms.get(code);
  if (!room) {
    room = { code, peers: new Set() };
    rooms.set(code, room);
  }
  return room;
}

function send(ws: WebSocket, msg: WsMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: WsMsg, exclude?: WebSocket) {
  for (const peer of room.peers) {
    if (peer.ws !== exclude) send(peer.ws, msg);
  }
}

/** Finds the host peer in a room (there's exactly one per party session). */
function findHost(room: Room): Peer | undefined {
  for (const peer of room.peers) if (peer.role === 'host') return peer;
  return undefined;
}

/** Lets HTTP routes (e.g. the vision-analysis endpoint) push a message into a session's room. */
export function broadcastToSession(session: string, msg: WsMsg) {
  const room = rooms.get(session);
  if (room) broadcast(room, msg);
}

export function initHub(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    let currentRoom: Room | null = null;
    let currentPeer: Peer | null = null;

    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 25_000);

    ws.on('message', (raw) => {
      let msg: WsMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'invalid JSON' });
        return;
      }

      switch (msg.type) {
        case 'join': {
          const room = getOrCreateRoom(msg.session);
          const peer: Peer = { ws, role: msg.role };
          room.peers.add(peer);
          currentRoom = room;
          currentPeer = peer;
          send(ws, { type: 'joined', session: room.code, role: msg.role, peers: room.peers.size });
          broadcast(room, { type: 'peer-joined', role: msg.role }, ws);
          break;
        }

        case 'rtc': {
          // Relay verbatim between phone (camera role) and host — never parse/rewrite SDP/ICE.
          if (!currentRoom) return;
          const target = currentPeer?.role === 'host' ? undefined : findHost(currentRoom);
          if (currentPeer?.role === 'host') {
            broadcast(currentRoom, msg, ws);
          } else if (target) {
            send(target.ws, msg);
          }
          break;
        }

        case 'control':
        case 'upload-ready': {
          if (!currentRoom) return;
          // Remote/upload-notify: phone -> host only.
          const host = findHost(currentRoom);
          if (host) send(host.ws, msg);
          break;
        }

        case 'quick-analysis': {
          if (!currentRoom) return;
          broadcast(currentRoom, msg);
          break;
        }

        case 'battle-start': {
          if (!currentRoom) return;
          const entrants = msg.entryIds
            .map((id) => {
              const entry = getEntry(id);
              if (!entry) return null;
              return { entryId: entry.id, thumb: entry.files.thumb ?? '', dancerName: entry.dancerName };
            })
            .filter((e): e is { entryId: string; thumb: string; dancerName: string } => !!e);
          startBattle(currentRoom.code, entrants);
          break;
        }

        case 'vote': {
          if (!currentRoom) return;
          castVote(currentRoom.code, msg.matchId, msg.pick, msg.deviceToken);
          break;
        }

        case 'battle-lock': {
          if (!currentRoom) return;
          lockMatch(currentRoom.code);
          break;
        }

        case 'battle-state': {
          if (!currentRoom) return;
          const state = getBattleState(currentRoom.code);
          if (state) send(ws, { type: 'battle-state', state });
          break;
        }

        case 'tally': {
          if (!currentRoom) return;
          broadcast(currentRoom, msg);
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (currentRoom && currentPeer) {
        currentRoom.peers.delete(currentPeer);
        broadcast(currentRoom, { type: 'peer-left', role: currentPeer.role });
        if (currentRoom.peers.size === 0) rooms.delete(currentRoom.code);
      }
    });
  });
}
