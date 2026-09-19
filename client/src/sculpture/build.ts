// Builds the 3D sculpture group from a MotionTape's world-space trails (plan §I). Five trails
// (both wrists, both ankles, nose) — the same joints that drive the live painting, so the
// sculpture is a 3D echo of the same movement.
import * as THREE from 'three';
import type { MotionTape } from '@shared/types.ts';
import { LM } from '../capture/pose.ts';
import { buildVariableTube } from './variableTube.ts';

export type UnfurlMode = 'orbit' | 'stream' | 'spiral';

const TRAIL_JOINTS = [LM.L_WRIST, LM.R_WRIST, LM.L_ANKLE, LM.R_ANKLE, LM.NOSE] as const;
const EMA_ALPHA = 0.25;
const MAX_POINTS = 300;

function applyUnfurl(points: THREE.Vector3[], times: number[], mode: UnfurlMode, durationMs: number): THREE.Vector3[] {
  if (mode === 'orbit') return points.map((p) => p.clone());
  return points.map((p, i) => {
    const t = durationMs > 0 ? times[i] / durationMs : 0;
    if (mode === 'stream') {
      return new THREE.Vector3(p.x, p.y, p.z + t * 1.4);
    }
    // spiral: rotate around Y axis by up to 270 degrees over the dance's duration.
    const angle = t * Math.PI * 1.5;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new THREE.Vector3(p.x * cos - p.z * sin, p.y, p.x * sin + p.z * cos);
  });
}

export function buildSculpture(tape: MotionTape, palette: string[], mode: UnfurlMode = 'orbit'): THREE.Group {
  const group = new THREE.Group();
  const colors = palette.map((hex) => new THREE.Color(hex));

  TRAIL_JOINTS.forEach((joint, jointIdx) => {
    const raw = tape.frames.map((f) => ({
      p: new THREE.Vector3(f.world[joint][0], f.world[joint][1], f.world[joint][2]),
      t: f.t,
    }));
    if (raw.length < 4) return;

    // EMA smoothing.
    const smoothed: THREE.Vector3[] = [];
    let prev = raw[0].p.clone();
    for (const r of raw) {
      prev = prev.clone().lerp(r.p, EMA_ALPHA);
      smoothed.push(prev.clone());
    }

    // Resample to at most MAX_POINTS.
    const step = Math.max(1, Math.floor(smoothed.length / MAX_POINTS));
    const points: THREE.Vector3[] = [];
    const times: number[] = [];
    for (let i = 0; i < smoothed.length; i += step) {
      points.push(smoothed[i]);
      times.push(raw[i].t);
    }
    if (points.length < 4) return;

    // Per-point speed drives radius + color lightness.
    const speeds: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const dt = Math.max(1, times[i] - times[i - 1]) / 1000;
      speeds.push(points[i].distanceTo(points[i - 1]) / dt);
    }
    const maxSpeed = Math.max(...speeds, 0.1);

    const radii = speeds.map((v, i) => {
      let r = 0.012 + 0.03 * Math.min(1, v / maxSpeed);
      for (const beatT of tape.beats) {
        const d = times[i] - beatT;
        r += 0.02 * Math.exp(-((d / 120) ** 2));
      }
      return r;
    });

    const baseColor = colors[jointIdx % colors.length];
    const trailColors = speeds.map((v) => baseColor.clone().lerp(new THREE.Color(0xffffff), (v / maxSpeed) * 0.35));

    const transformed = applyUnfurl(points, times, mode, tape.durationMs);
    const geometry = buildVariableTube({ points: transformed, radii, colors: trailColors });
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.35, clearcoat: 0.5 });
    group.add(new THREE.Mesh(geometry, material));

    // Endcap spheres — open tubes are non-manifold, which breaks STL slicers (plan §I).
    const startCap = new THREE.Mesh(new THREE.SphereGeometry(radii[0], 12, 12), material);
    startCap.position.copy(transformed[0]);
    const endCap = new THREE.Mesh(new THREE.SphereGeometry(radii[radii.length - 1], 12, 12), material);
    endCap.position.copy(transformed[transformed.length - 1]);
    group.add(startCap, endCap);
  });

  return group;
}
