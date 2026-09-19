// Custom variable-radius tube geometry (plan §I). THREE.TubeGeometry is constant-radius, so
// this builds one from scratch using computeFrenetFrames — verified against the installed
// three@0.186.0 API: computeFrenetFrames(segments, closed) returns {tangents, normals,
// binormals} arrays of length segments+1.
import * as THREE from 'three';

export interface TubeOptions {
  /** World-space points along the trail, already smoothed/resampled. */
  points: THREE.Vector3[];
  /** Per-point radius, same length as points. */
  radii: number[];
  /** Per-point color, same length as points. */
  colors: THREE.Color[];
  radialSegments?: number;
}

function lerpScalarAt(arr: number[], u: number): number {
  const idx = u * (arr.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(arr.length - 1, i0 + 1);
  return arr[i0] + (arr[i1] - arr[i0]) * (idx - i0);
}

function lerpColorAt(arr: THREE.Color[], u: number): THREE.Color {
  const idx = u * (arr.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(arr.length - 1, i0 + 1);
  return new THREE.Color().lerpColors(arr[i0], arr[i1], idx - i0);
}

export function buildVariableTube({ points, radii, colors, radialSegments = 8 }: TubeOptions): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segments = Math.min(points.length * 3, 300);
  const frenet = curve.computeFrenetFrames(segments, false);

  const positions: number[] = [];
  const colorArr: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const r = lerpScalarAt(radii, u);
    const c = lerpColorAt(colors, u);
    const normal = frenet.normals[i];
    const binormal = frenet.binormals[i];

    for (let j = 0; j < radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = p.x + r * (cos * normal.x + sin * binormal.x);
      const y = p.y + r * (cos * normal.y + sin * binormal.y);
      const z = p.z + r * (cos * normal.z + sin * binormal.z);
      positions.push(x, y, z);
      colorArr.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c2 = a + radialSegments;
      const d = b + radialSegments;
      indices.push(a, b, c2, b, d, c2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
