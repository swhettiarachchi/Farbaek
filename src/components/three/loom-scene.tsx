"use client";

/**
 * "The Loom": the hero's 3D scene. The supplied knight logo levitates at the
 * centre as a textured plane (its pixels unaltered, unlit basic material),
 * while the six RealityLoop stages orbit around it, passing in front of and
 * behind the figure. Evidence packets travel along the thread and fine
 * particles drift upward. Purely illustrative; labelled as such on the page.
 *
 * Loaded lazily by HeroVisual only on capable devices, never under reduced
 * motion, and paused whenever it is off-screen or the tab is hidden.
 */
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { LOGO } from "@/components/brand/brand-logo";
import { FrameGovernor, fallBackOnContextLoss } from "./frame-governor";
import { LOOM, LOOM_COLORS } from "./loom-geometry";

// The shape, colours and speeds are shared with the 2D drawing phones get (loom-geometry.ts, ADR 0056).
const { accent: ACCENT, cyan: CYAN, ink: INK, stages: STAGE_COLORS } = LOOM_COLORS;
const PACKETS = LOOM.packets.count;
const MOTES = LOOM.motes.count;

type PointerRef = RefObject<{ x: number; y: number }>;

/** Pointer position over the whole window, normalised to -1..1. The canvas itself ignores pointer events. */
function useWindowPointer(): PointerRef {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return pointer;
}

function orbitCurve(rx: number, rz: number): THREE.CatmullRomCurve3 {
  const points = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz);
  });
  return new THREE.CatmullRomCurve3(points, true, "centripetal");
}

function Knight({ onReady, pointer }: { onReady: () => void; pointer: PointerRef }) {
  const loaded = useLoader(THREE.TextureLoader, LOGO.src);
  const mesh = useRef<THREE.Mesh>(null);

  // Configure a local copy: the loader's cached texture is shared and must stay untouched.
  const texture = useMemo(() => {
    const t = loaded.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }, [loaded]);

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => onReady(), [onReady]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const p = pointer.current;
    m.position.y = LOOM.knight.y + Math.sin(clock.elapsedTime * 0.9) * 0.06;
    m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, p.x * 0.14, 0.04);
    m.rotation.x = THREE.MathUtils.lerp(m.rotation.x, -p.y * 0.06, 0.04);
  });

  const height = LOOM.knight.height;
  return (
    <mesh ref={mesh}>
      <planeGeometry args={[(height * LOGO.width) / LOGO.height, height]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.04} toneMapped={false} />
    </mesh>
  );
}

function Loom() {
  const spin = useRef<THREE.Group>(null);
  const packets = useRef<THREE.InstancedMesh>(null);
  const inner = useMemo(() => orbitCurve(LOOM.inner.rx, LOOM.inner.rz), []);
  const outer = useMemo(() => orbitCurve(LOOM.outer.rx, LOOM.outer.rz), []);
  const innerTube = useMemo(() => new THREE.TubeGeometry(inner, 256, LOOM.inner.tube, 8, true), [inner]);
  const outerTube = useMemo(() => new THREE.TubeGeometry(outer, 256, LOOM.outer.tube, 6, true), [outer]);
  const nodes = useMemo(() => STAGE_COLORS.map((color, i) => ({ color, position: inner.getPointAt(i / STAGE_COLORS.length) })), [inner]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(
    () => () => {
      innerTube.dispose();
      outerTube.dispose();
    },
    [innerTube, outerTube],
  );

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (spin.current) spin.current.rotation.y += delta * LOOM.spin;
    const mesh = packets.current;
    if (!mesh) return;
    for (let i = 0; i < PACKETS; i++) {
      const u = (t * LOOM.packets.lapsPerSecond + i / PACKETS) % 1;
      dummy.position.copy(inner.getPointAt(u));
      dummy.scale.setScalar(0.7 + 0.3 * Math.sin(t * 3 + i));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group rotation={[...LOOM.tilt]} position={[0, LOOM.drop, 0]}>
      <group ref={spin}>
        <mesh geometry={innerTube}>
          <meshBasicMaterial color={ACCENT} transparent opacity={LOOM.inner.opacity} toneMapped={false} />
        </mesh>
        <mesh geometry={outerTube}>
          <meshBasicMaterial color={INK} transparent opacity={LOOM.outer.opacity} toneMapped={false} />
        </mesh>
        {nodes.map((node, i) => (
          <group key={i} position={node.position}>
            <mesh>
              <sphereGeometry args={[LOOM.node.core, 24, 24]} />
              <meshBasicMaterial color={node.color} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[LOOM.node.halo, 24, 24]} />
              <meshBasicMaterial color={node.color} transparent opacity={LOOM.node.haloOpacity} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        ))}
        <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]}>
          <sphereGeometry args={[LOOM.packets.size, 12, 12]} />
          <meshBasicMaterial color={CYAN} toneMapped={false} />
        </instancedMesh>
      </group>
    </group>
  );
}

/** Fine particles rising slowly, the "antigravity" field. Deterministic seed. */
function Motes({ pointer }: { pointer: PointerRef }) {
  const points = useRef<THREE.Points>(null);
  const { geometry, speeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(MOTES * 3);
    const colors = new Float32Array(MOTES * 3);
    const speeds = new Float32Array(MOTES);
    const palette = LOOM_COLORS.motes.map((c) => new THREE.Color(c));
    let seed: number = LOOM.motes.seed;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < MOTES; i++) {
      positions.set([(rand() - 0.5) * 9, (rand() - 0.5) * 7, (rand() - 0.5) * 4 - 1], i * 3);
      const c = palette[Math.floor(rand() * palette.length)]!;
      colors.set([c.r, c.g, c.b], i * 3);
      speeds[i] = 0.05 + rand() * 0.12;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geometry: g, speeds };
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < MOTES; i++) {
      let y = arr[i * 3 + 1]! + speeds[i]! * delta;
      if (y > 3.5) y = -3.5;
      arr[i * 3 + 1] = y;
    }
    attr.needsUpdate = true;
    if (points.current) {
      const p = pointer.current;
      points.current.rotation.y = THREE.MathUtils.lerp(points.current.rotation.y, p.x * 0.08, 0.03);
      points.current.rotation.x = THREE.MathUtils.lerp(points.current.rotation.x, -p.y * 0.04, 0.03);
    }
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={LOOM.motes.size} vertexColors transparent opacity={LOOM.motes.opacity} sizeAttenuation depthWrite={false} toneMapped={false} />
    </points>
  );
}

export default function LoomScene({ active, onReady, onSlow }: { active: boolean; onReady: () => void; onSlow: () => void }) {
  const pointer = useWindowPointer();
  return (
    <Canvas
      onCreated={fallBackOnContextLoss(onSlow)}
      className="!absolute inset-0"
      style={{ pointerEvents: "none" }}
      frameloop={active ? "always" : "demand"}
      dpr={[1, 1.5]}
      camera={{ position: [0, LOOM.camera.y, LOOM.camera.z], fov: LOOM.camera.fov }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Knight onReady={onReady} pointer={pointer} />
      </Suspense>
      <Loom />
      <Motes pointer={pointer} />
      <FrameGovernor onSlow={onSlow} />
    </Canvas>
  );
}
