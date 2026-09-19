// Shared contracts between client and server. Plain .ts folder (not a workspace package) so
// Node's native TypeScript stripping can resolve it via relative imports with explicit .ts
// extensions. See plan §"Node-native TS rules".

/** One MediaPipe landmark as a flat tuple: [x, y, z, visibility]. Visibility only on `lm`. */
export type LandmarkXYZV = [number, number, number, number];
/** World-space landmark in meters, hip-origin: [x, y, z]. */
export type LandmarkXYZ = [number, number, number];

export interface MotionFrame {
  /** Milliseconds since the dance started. */
  t: number;
  /** 33 normalized landmarks in screen space (for painting). */
  lm: LandmarkXYZV[];
  /** 33 world landmarks in meters, hip-origin (for sculpture/stats). */
  world: LandmarkXYZ[];
}

export interface MotionTape {
  frames: MotionFrame[];
  /** Beat timestamps in ms since dance start. */
  beats: number[];
  bpm: number;
  /** Smoothed 0..1 energy value sampled at the same cadence as frames. */
  energySeries: number[];
  /** Seed for the live painter's RNG so hi-res replay is deterministic. */
  seed: number;
  durationMs: number;
}

export interface VisionAnalysis {
  culture: string;
  danceStyle: string;
  mood: string;
  /** 5-6 hex colors, e.g. "#RRGGBB". */
  colorPalette: string[];
  artStyleReferences: string[];
  perceivedExperience: string;
  movementKeywords: string[];
  /** true when this came from the claude CLI; false when it's a genre-preset fallback. */
  fromVision: boolean;
}

export interface DanceStats {
  durationMs: number;
  bpm: number;
  /** Total wrist travel distance in meters, from world landmarks. */
  wristTravelMeters: number;
  jumps: number;
  spins: number;
  /** Timestamp (ms) of the highest-energy moment. */
  peakMomentMs: number;
  /** 0..1 smoothness score (inverse of mean jerk, normalized). */
  smoothness: number;
  /** 0..1 fraction of beats where movement energy spiked within +-150ms. */
  grooveSyncPct: number;
}

export interface SongInfo {
  title: string;
  artist: string;
  genre: string;
  artworkUrl?: string;
  previewUrl?: string;
}

export interface GalleryFiles {
  painting?: string;
  poster?: string;
  thumb?: string;
  sculptureGlb?: string;
  /** Champion-edition poster variant, set when this entry wins an art battle (plan §L). */
  champion?: string;
}

export interface GalleryEntry {
  id: string;
  dancerName: string;
  song: SongInfo;
  culture: string;
  danceStyle: string;
  mood: string;
  palette: string[];
  stats: DanceStats;
  createdAt: string;
  files: GalleryFiles;
  championOf?: string;
}

// ---- WebSocket protocol -----------------------------------------------------------------

export type WsRole = 'host' | 'phone' | 'voter';
export type PhoneCapability = 'camera' | 'remote' | 'upload' | 'vote';

// Structural equivalents of the DOM lib's RTCSessionDescriptionInit/RTCIceCandidateInit —
// this file is shared with the server, which has no DOM lib. The server only relays these
// verbatim (plan §K) and never inspects their fields, so a structural shape is sufficient.
export interface RtcSdpLike {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}
export interface RtcIceCandidateLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type WsMsg =
  | { type: 'join'; session: string; role: WsRole }
  | { type: 'joined'; session: string; role: WsRole; peers: number }
  | { type: 'peer-joined'; role: WsRole }
  | { type: 'peer-left'; role: WsRole }
  | { type: 'rtc'; sdp?: RtcSdpLike; candidate?: RtcIceCandidateLike }
  | { type: 'control'; action: 'start' | 'stop' | 'surprise' | 'pick'; payload?: unknown }
  | { type: 'upload-ready'; url: string; name: string }
  | { type: 'battle-start'; entryIds: string[] }
  | { type: 'battle-lock' }
  | { type: 'vote'; matchId: string; pick: 'a' | 'b'; deviceToken: string }
  | { type: 'tally'; matchId: string; a: number; b: number; voters: number }
  | { type: 'quick-analysis'; analysis: VisionAnalysis }
  | { type: 'battle-state'; state: BattleState }
  | { type: 'error'; message: string };

// ---- Art battle --------------------------------------------------------------------------

export interface BattleEntrant {
  entryId: string;
  thumb: string;
  dancerName: string;
}

export interface BattleMatch {
  id: string;
  round: number;
  a: BattleEntrant | null;
  b: BattleEntrant | null;
  status: 'idle' | 'voting' | 'locked' | 'done';
  endsAt?: number;
  winner?: 'a' | 'b';
  tie?: boolean;
}

export interface BattleState {
  matches: BattleMatch[];
  currentMatchId: string | null;
  championEntryId: string | null;
}
