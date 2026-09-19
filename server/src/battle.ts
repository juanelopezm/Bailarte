// Art battle bracket engine (plan §L). Server-authoritative: votes are deduped by deviceToken,
// tallies are computed here (not by clients relaying raw vote counts to each other), and the
// bracket grows round-by-round as winners are decided. One battle runs per session at a time.
import { nanoid } from 'nanoid';
import { broadcastToSession } from './wsHub.ts';
import { setChampion } from './gallery.ts';
import type { BattleEntrant, BattleMatch, BattleState } from '../../shared/types.ts';

interface RuntimeMatch extends BattleMatch {
  votes: Map<string, 'a' | 'b'>;
}

interface RuntimeBattle {
  session: string;
  matches: RuntimeMatch[];
  championEntryId: string | null;
  lockTimer?: ReturnType<typeof setTimeout>;
}

const MATCH_DURATION_MS = 20_000;
const battles = new Map<string, RuntimeBattle>();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toPublicMatch(m: RuntimeMatch): BattleMatch {
  const { votes: _votes, ...pub } = m;
  return pub;
}

function currentMatch(b: RuntimeBattle): RuntimeMatch | null {
  return b.matches.find((m) => m.status === 'voting') ?? null;
}

function publicState(b: RuntimeBattle): BattleState {
  return {
    matches: b.matches.map(toPublicMatch),
    currentMatchId: currentMatch(b)?.id ?? null,
    championEntryId: b.championEntryId,
  };
}

function broadcastState(b: RuntimeBattle) {
  broadcastToSession(b.session, { type: 'battle-state', state: publicState(b) });
}

/** After a round's matches are all done: crown a champion, or build the next round from winners. */
function advanceBracket(b: RuntimeBattle) {
  const rounds = [...new Set(b.matches.map((m) => m.round))].sort((x, y) => x - y);
  const lastRound = rounds[rounds.length - 1];
  const lastRoundMatches = b.matches.filter((m) => m.round === lastRound);
  if (!lastRoundMatches.every((m) => m.status === 'done')) return;

  if (lastRoundMatches.length === 1) {
    const final = lastRoundMatches[0];
    const championId = final.winner === 'a' ? final.a?.entryId : final.b?.entryId;
    if (championId) {
      b.championEntryId = championId;
      setChampion(championId, b.session);
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
      votes: new Map(),
    });
  }
}

/** Starts the next idle match (voting timer + auto-lock), if any. */
function startNextMatch(b: RuntimeBattle) {
  if (currentMatch(b)) return; // one match voting at a time
  const next = b.matches.find((m) => m.status === 'idle');
  if (!next) return;
  next.status = 'voting';
  next.endsAt = Date.now() + MATCH_DURATION_MS;
  b.lockTimer = setTimeout(() => lockMatch(b.session, next.id), MATCH_DURATION_MS);
}

export function startBattle(session: string, entrants: BattleEntrant[]): BattleState {
  const existing = battles.get(session);
  if (existing?.lockTimer) clearTimeout(existing.lockTimer);

  const shuffled = shuffle(entrants);
  const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(2, shuffled.length))));
  const byeCount = size - shuffled.length;

  const round1: RuntimeMatch[] = [];
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
      votes: new Map(),
    });
  }

  const battle: RuntimeBattle = { session, matches: round1, championEntryId: null };
  battles.set(session, battle);

  advanceBracket(battle);
  startNextMatch(battle);
  broadcastState(battle);
  return publicState(battle);
}

export function castVote(session: string, matchId: string, pick: 'a' | 'b', deviceToken: string) {
  const b = battles.get(session);
  const match = b?.matches.find((m) => m.id === matchId);
  if (!b || !match || match.status !== 'voting') return;

  match.votes.set(deviceToken, pick); // re-tapping switches your vote — Map dedupes by token
  const a = [...match.votes.values()].filter((v) => v === 'a').length;
  const bCount = [...match.votes.values()].filter((v) => v === 'b').length;
  broadcastToSession(session, { type: 'tally', matchId, a, b: bCount, voters: match.votes.size });
}

export function lockMatch(session: string, matchId?: string) {
  const b = battles.get(session);
  if (!b) return;
  const match = matchId ? b.matches.find((m) => m.id === matchId) : currentMatch(b);
  if (!match || match.status !== 'voting') return;
  if (b.lockTimer) clearTimeout(b.lockTimer);

  const a = [...match.votes.values()].filter((v) => v === 'a').length;
  const bCount = [...match.votes.values()].filter((v) => v === 'b').length;
  match.status = 'done';
  if (a === bCount) {
    match.tie = true;
    match.winner = Math.random() < 0.5 ? 'a' : 'b';
  } else {
    match.winner = a > bCount ? 'a' : 'b';
  }

  advanceBracket(b);
  startNextMatch(b);
  broadcastState(b);
}

export function getBattleState(session: string): BattleState | null {
  const b = battles.get(session);
  return b ? publicState(b) : null;
}
