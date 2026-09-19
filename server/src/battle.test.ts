import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./wsHub.ts', () => ({ broadcastToSession: vi.fn() }));
vi.mock('./gallery.ts', () => ({ setChampion: vi.fn() }));

import { startBattle, castVote, lockMatch, getBattleState } from './battle.ts';
import { setChampion } from './gallery.ts';

function entrant(id: string) {
  return { entryId: id, thumb: `/t/${id}.jpg`, dancerName: id };
}

let sessionCounter = 0;
function freshSession() {
  return `TEST${sessionCounter++}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startBattle', () => {
  it('with 2 entrants creates a single voting match, no byes', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b')]);
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0].status).toBe('voting');
    expect(state.currentMatchId).toBe(state.matches[0].id);
    expect(state.championEntryId).toBeNull();
  });

  it('with 3 entrants assigns exactly one bye in round 1', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b'), entrant('c')]);
    const round1 = state.matches.filter((m) => m.round === 1);
    expect(round1).toHaveLength(2);
    const byes = round1.filter((m) => m.status === 'done');
    const voting = round1.filter((m) => m.status === 'voting');
    expect(byes).toHaveLength(1);
    expect(voting).toHaveLength(1);
    // Bye match should have exactly one side filled and an immediate winner.
    expect(byes[0].winner).toBe('a');
    expect(byes[0].a).not.toBeNull();
    expect(byes[0].b).toBeNull();
  });

  it('with 1 entrant crowns them champion immediately (degenerate case)', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('solo')]);
    expect(state.championEntryId).toBe('solo');
    expect(setChampion).toHaveBeenCalledWith('solo', session);
  });
});

describe('castVote', () => {
  it('dedupes by deviceToken and lets a re-tap switch the pick', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b')]);
    const matchId = state.matches[0].id;

    castVote(session, matchId, 'a', 'device-1');
    castVote(session, matchId, 'b', 'device-2');
    castVote(session, matchId, 'b', 'device-1'); // switches device-1's vote

    lockMatch(session);
    const final = getBattleState(session);
    // device-1 switched to 'b', device-2 voted 'b' -> b wins 2-0.
    expect(final?.matches[0].winner).toBe('b');
  });

  it('ignores votes for a match that is not currently voting', () => {
    const session = freshSession();
    startBattle(session, [entrant('a'), entrant('b')]);
    castVote(session, 'not-a-real-match-id', 'a', 'device-1');
    // Should not throw, and the real match's tally should be unaffected (no crash is the assertion).
    expect(getBattleState(session)?.matches[0].status).toBe('voting');
  });
});

describe('lockMatch', () => {
  it('breaks a tie with a coin flip and flags it', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b')]);
    const matchId = state.matches[0].id;

    castVote(session, matchId, 'a', 'device-1');
    castVote(session, matchId, 'b', 'device-2');
    lockMatch(session);

    const final = getBattleState(session);
    expect(final?.matches[0].tie).toBe(true);
    expect(['a', 'b']).toContain(final?.matches[0].winner);
  });

  it('auto-locks via its own timer after MATCH_DURATION_MS', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b')]);
    castVote(session, state.matches[0].id, 'a', 'device-1');

    vi.advanceTimersByTime(20_000);

    const final = getBattleState(session);
    expect(final?.matches[0].status).toBe('done');
    expect(final?.matches[0].winner).toBe('a');
  });

  it('advances a 4-entrant bracket through two rounds to a single champion', () => {
    const session = freshSession();
    const state = startBattle(session, [entrant('a'), entrant('b'), entrant('c'), entrant('d')]);
    expect(state.matches.filter((m) => m.round === 1)).toHaveLength(2);

    // Round 1, match 1: 'a' side wins.
    let current = getBattleState(session)!.currentMatchId!;
    castVote(session, current, 'a', 'd1');
    lockMatch(session);

    // Round 1, match 2 should now be voting.
    current = getBattleState(session)!.currentMatchId!;
    expect(current).toBeTruthy();
    castVote(session, current, 'a', 'd2');
    lockMatch(session);

    // Round 2 (final) should now be voting with the two round-1 winners.
    const afterRound1 = getBattleState(session)!;
    expect(afterRound1.championEntryId).toBeNull();
    current = afterRound1.currentMatchId!;
    expect(current).toBeTruthy();

    castVote(session, current, 'a', 'd3');
    lockMatch(session);

    const final = getBattleState(session)!;
    expect(final.championEntryId).not.toBeNull();
    expect(final.currentMatchId).toBeNull();
    expect(setChampion).toHaveBeenCalledWith(final.championEntryId, session);
  });
});
