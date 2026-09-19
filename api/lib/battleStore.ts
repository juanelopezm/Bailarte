// Art battle bracket engine (plan §L), Redis-backed port of server/src/battle.ts for the
// serverless deployment. Same bracket/bye/vote-dedupe/coin-flip logic; the one real difference
// is timing — there's no setTimeout that survives between invocations, so lockMatch() is only
// ever called on demand (the host's own BattleScreen calls it when its local countdown hits
// zero, or via the manual "lock now" button) rather than self-scheduled.
import { nanoid } from 'nanoid';
import { redis } from './redis.ts';
import { triggerMsg } from './pusherServer.ts';
import { setChampion } from './galleryStore.ts';
import type { BattleEntrant, BattleMatch, BattleState } from '../../shared/types.ts';

interface StoredMatch extends BattleMatch {
  votes: Record<string, 'a' | 'b'>;
}
interface StoredBattle {
  matches: StoredMatch[];
  championEntryId: string | null;
}

const MATCH_DURATION_MS = 20_000;
const keyFor = (session: string) => `battle:${session}`;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toPublicMatch(m: StoredMatch): BattleMatch {
  const { votes: _votes, ...pub } = m;
  return pub;
}

function currentMatch(b: StoredBattle): StoredMatch | null {
  return b.matches.find((m) => m.status === 'voting') ?? null;
}

function publicState(b: StoredBattle): BattleState {
  return {
    matches: b.matches.map(toPublicMatch),
    currentMatchId: currentMatch(b)?.id ?? null,
    championEntryId: b.championEntryId,
  };
}

async function load(session: string): Promise<StoredBattle | null> {
  return redis.get<StoredBattle>(keyFor(session));
}

async function save(session: string, b: StoredBattle) {
  await redis.set(keyFor(session), b);
}

function startNextMatch(b: StoredBattle) {
  if (currentMatch(b)) return;
  const next = b.matches.find((m) => m.status === 'idle');
  if (!next) return;
  next.status = 'voting';
  next.endsAt = Date.now() + MATCH_DURATION_MS;
}

export async function startBattle(session: string, entrants: BattleEntrant[]): Promise<BattleState> {
  const shuffled = shuffle(entrants);
  const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, shuffled.length))));
  const byeCount = size - shuffled.length;

  const round1: StoredMatch[] = [];
  let i = 0;
  for (let m = 0; m < size / 2; m++) {
    const a = shuffled[i++] ?? null;
    const isBye = m < byeCount;
    const b = isBye ? null : (shuffled[i++] ?? null);
    round1.push({
      id: nanoid(6),
      round: 1,
      a,
      b,
      status: a && !b ? 'done' : 'idle',
      winner: a && !b ? 'a' : undefined,
      votes: {},
    });
  }

  const battle: StoredBattle = { matches: round1, championEntryId: null };
  await advanceBracket(battle, session);
  startNextMatch(battle);
  await save(session, battle);
  const state = publicState(battle);
  await triggerMsg(session, { type: 'battle-state', state });
  return state;
}

/**
 * After a round's matches are all done: crown a champion, or build the next round from winners.
 * Takes the session code explicitly (rather than storing it inside StoredBattle) purely to call
 * setChampion() with the right championOf value — Redis already keys the battle by session.
 */
async function advanceBracket(b: StoredBattle, session: string) {
  const rounds = [...new Set(b.matches.map((m) => m.round))].sort((x, y) => x - y);
  const lastRound = rounds[rounds.length - 1];
  const lastRoundMatches = b.matches.filter((m) => m.round === lastRound);
  if (!lastRoundMatches.every((m) => m.status === 'done')) return;

  if (lastRoundMatches.length === 1) {
    const final = lastRoundMatches[0];
    const championId = final.winner === 'a' ? final.a?.entryId : final.b?.entryId;
    if (championId) {
      b.championEntryId = championId;
      await setChampion(championId, session);
    }
    return;
  }

  const winners: BattleEntrant[] = lastRoundMatches
    .map((m) => (m.winner === 'a' ? m.a : m.b))
    .filter((e): e is BattleEntrant => !!e);

  const nextRound = lastRound + 1;
  for (let i = 0; i < winners.length; i += 2) {
    b.matches.push({
      id: nanoid(6),
      round: nextRound,
      a: winners[i] ?? null,
      b: winners[i + 1] ?? null,
      status: 'idle',
      votes: {},
    });
  }
}

export async function castVote(
  session: string,
  matchId: string,
  pick: 'a' | 'b',
  deviceToken: string,
): Promise<{ matchId: string; a: number; b: number; voters: number } | null> {
  const b = await load(session);
  const match = b?.matches.find((m) => m.id === matchId);
  if (!b || !match || match.status !== 'voting') return null;

  match.votes[deviceToken] = pick;
  const votes = Object.values(match.votes);
  const a = votes.filter((v) => v === 'a').length;
  const bCount = votes.filter((v) => v === 'b').length;
  await save(session, b);

  const tally = { matchId, a, b: bCount, voters: votes.length };
  await triggerMsg(session, { type: 'tally', ...tally });
  return tally;
}

export async function lockMatch(session: string): Promise<BattleState | null> {
  const b = await load(session);
  if (!b) return null;
  const match = currentMatch(b);
  if (!match) return null;

  const votes = Object.values(match.votes);
  const a = votes.filter((v) => v === 'a').length;
  const bCount = votes.filter((v) => v === 'b').length;
  match.status = 'done';
  if (a === bCount) {
    match.tie = true;
    match.winner = Math.random() < 0.5 ? 'a' : 'b';
  } else {
    match.winner = a > bCount ? 'a' : 'b';
  }

  await advanceBracket(b, session);
  startNextMatch(b);
  await save(session, b);

  const state = publicState(b);
  await triggerMsg(session, { type: 'battle-state', state });
  return state;
}

export async function getBattleState(session: string): Promise<BattleState | null> {
  const b = await load(session);
  return b ? publicState(b) : null;
}
