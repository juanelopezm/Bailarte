// WebRTC signaling helper (plan §K). One class serves both roles: the phone is always the
// offerer (it has the camera), the host is always the answerer. Signaling messages are relayed
// verbatim through the ws hub — this file only ever inspects them, never rewrites them.
import type { WsMsg } from '@shared/types.ts';

export class RtcPeer {
  private pc: RTCPeerConnection;
  private isOfferer: boolean;
  private sendSignal: (msg: WsMsg) => void;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  // erasableSyntaxOnly forbids TS constructor parameter-property shorthand (it emits real
  // assignment code, not just erasable type annotations) — assign fields explicitly instead.
  constructor(isOfferer: boolean, sendSignal: (msg: WsMsg) => void, onRemoteStream?: (stream: MediaStream) => void) {
    this.isOfferer = isOfferer;
    this.sendSignal = sendSignal;
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ type: 'rtc', candidate: e.candidate.toJSON() });
    };

    if (onRemoteStream) {
      this.pc.ontrack = (e) => onRemoteStream(e.streams[0]);
    }
  }

  /** Phone side: attach the local camera stream and send the initial offer. */
  async startAsOfferer(localStream: MediaStream) {
    localStream.getTracks().forEach((track) => this.pc.addTrack(track, localStream));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: 'rtc', sdp: { type: 'offer', sdp: offer.sdp } });
  }

  /** Call for every 'rtc' message received from the ws hub, on both sides. */
  async handleSignal(msg: Extract<WsMsg, { type: 'rtc' }>) {
    if (msg.sdp) {
      if (msg.sdp.type === 'offer' && !this.isOfferer) {
        await this.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp.sdp });
        this.remoteDescSet = true;
        await this.flushPendingCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: 'rtc', sdp: { type: 'answer', sdp: answer.sdp } });
      } else if (msg.sdp.type === 'answer' && this.isOfferer) {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp.sdp });
        this.remoteDescSet = true;
        await this.flushPendingCandidates();
      }
    } else if (msg.candidate) {
      const candidate: RTCIceCandidateInit = {
        candidate: msg.candidate.candidate,
        sdpMid: msg.candidate.sdpMid,
        sdpMLineIndex: msg.candidate.sdpMLineIndex ?? undefined,
      };
      // Trickle ICE can arrive before the remote description is set — buffer it (plan §K gotcha).
      if (this.remoteDescSet) {
        await this.pc.addIceCandidate(candidate);
      } else {
        this.pendingCandidates.push(candidate);
      }
    }
  }

  private async flushPendingCandidates() {
    for (const c of this.pendingCandidates) {
      await this.pc.addIceCandidate(c);
    }
    this.pendingCandidates = [];
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  onConnectionStateChange(cb: (state: RTCPeerConnectionState) => void) {
    this.pc.onconnectionstatechange = () => cb(this.pc.connectionState);
  }

  close() {
    this.pc.close();
  }
}
