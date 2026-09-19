// 3D sculpture viewer + GLB/STL export (plan §I, DELIGHT #4). GLB keeps vertex colors (the
// showpiece export); STL is colorless by format, so the export path strips color/uv before
// merging — mergeGeometries requires every input to share the exact same attribute set.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSculpture, type UnfurlMode } from './build.ts';
import type { MotionTape } from '@shared/types.ts';

interface Props {
  tape: MotionTape;
  palette: string[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SculptureView({ tape, palette }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [mode, setMode] = useState<UnfurlMode>('orbit');
  const [exporting, setExporting] = useState<'glb' | 'stl' | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0.9, 0.7, 0.9);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.enableDamping = true;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    scene.add(floor);

    const group = buildSculpture(tape, palette, mode);
    groupRef.current = group;
    scene.add(group);

    let raf = 0;
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, [tape, palette, mode]);

  async function exportGLB() {
    if (!groupRef.current) return;
    setExporting('glb');
    try {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(groupRef.current, { binary: true });
      const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
      downloadBlob(blob, 'escultura.glb');
    } catch (err) {
      console.error('[sculpture] GLB export failed', err);
    } finally {
      setExporting(null);
    }
  }

  function exportSTL() {
    if (!groupRef.current) return;
    setExporting('stl');
    try {
      const cleanGeometries: THREE.BufferGeometry[] = [];
      groupRef.current.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const g = obj.geometry.clone();
        g.applyMatrix4(obj.matrixWorld);
        // STL is colorless — strip every attribute except position/normal so all geometries
        // (tubes with color, sphere endcaps without) share an identical attribute set, which
        // mergeGeometries requires.
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        }
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        cleanGeometries.push(g);
      });

      const merged = mergeGeometries(cleanGeometries, false);
      if (!merged) throw new Error('mergeGeometries returned null');
      // Scale x100: the scene is in meters (~1 unit); STL is read as mm by slicers, so this
      // yields a ~75-150mm print instead of a sub-millimeter one.
      merged.scale(100, 100, 100);
      const mesh = new THREE.Mesh(merged);
      const exporter = new STLExporter();
      const result = exporter.parse(mesh, { binary: true }) as DataView;
      const blob = new Blob([result.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, 'escultura.stl');
    } catch (err) {
      console.error('[sculpture] STL export failed', err);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '1.5rem auto' }}>
      <div ref={containerRef} style={{ width: '100%', height: 400, borderRadius: 12, overflow: 'hidden', background: '#050505' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        {(['orbit', 'stream', 'spiral'] as UnfurlMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{ padding: '0.4rem 1rem', borderRadius: 999, opacity: mode === m ? 1 : 0.5, fontWeight: mode === m ? 700 : 400 }}
          >
            {m === 'orbit' ? 'órbita' : m === 'stream' ? 'flujo' : 'espiral'}
          </button>
        ))}
        <button onClick={exportGLB} disabled={exporting !== null} style={{ padding: '0.4rem 1rem', borderRadius: 999 }}>
          {exporting === 'glb' ? 'exportando…' : '⬇ GLB (color)'}
        </button>
        <button onClick={exportSTL} disabled={exporting !== null} style={{ padding: '0.4rem 1rem', borderRadius: 999 }}>
          {exporting === 'stl' ? 'exportando…' : '⬇ STL (imprimible)'}
        </button>
      </div>
      <p style={{ textAlign: 'center', opacity: 0.4, fontSize: 11, marginTop: 6 }}>
        GLB conserva los colores. STL es para impresión 3D (sin color, escala ~10cm).
      </p>
    </div>
  );
}
