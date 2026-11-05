"use client";

/**
 * The Agent Core (ADR 0025): a glass orb with a nucleus, a wire shell and an
 * orbit of evidence packets, on the Build run page. Its motion follows the
 * run's phase: it spins up while writing and running, nearly stops while it
 * waits for you, settles when finished and stops when the run stops.
 *
 * Colours are read from the design tokens at mount (the fallbacks are the
 * same values, for a token that fails to read). Loaded lazily by AgentCore
 * only on capable devices, never under reduced motion, and paused whenever
 * it is off-screen or the tab is hidden.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CorePhase } from "@/core/agent/run-phase";
import { FrameGovernor, fallBackOnContextLoss } from "./frame-governor";

type Token = "accent" | "approval" | "verified" | "ink-3";

/** How each phase moves. Colour is only one of four signals; the page also shows the phase's label. */
const PHASE: Record<CorePhase, { color: Token; spin: number; flow: number; energy: number }> = {
  idle: { color: "accent", spin: 0.12, flow: 0.02, energy: 0.2 },
  starting: { color: "accent", spin: 0.25, flow: 0.04, energy: 0.35 },
  working: { color: "accent", spin: 0.6, flow: 0.12, energy: 0.8 },
  thinking: { color: "accent", spin: 0.45, flow: 0.07, energy: 0.8 },
  reading: { color: "accent", spin: 0.35, flow: 0.12, energy: 0.55 },
  writing: { color: "accent", spin: 0.85, flow: 0.18, energy: 1 },
  running: { color: "accent", spin: 1.25, flow: 0.3, energy: 1 },
  waiting: { color: "approval", spin: 0.06, flow: 0, energy: 0.45 },
  done: { color: "verified", spin: 0.08, flow: 0.015, energy: 0.12 },
  stopped: { color: "ink-3", spin: 0, flow: 0, energy: 0 },
};

const PACKETS = 9;

function token(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function useTokens() {
  return useMemo(
    () => ({
      accent: token("accent", "#2450f0"),
      approval: token("approval", "#9a4d00"),
      verified: token("verified", "#137347"),
      "ink-3": token("ink-3", "#636975"),
      // Signal cyan is allowed in the orbit only (ADR 0008).
      orbit: token("accent-2", "#0a6e85"),
      ink: token("ink", "#121317"),
    }),
    [],
  );
}

const glassVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// A fresnel rim: clear in the middle, the phase colour at the edge, breathing with the energy.
const glassFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uEnergy;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
    float breathe = 0.5 + 0.5 * sin(uTime * 2.6);
    float alpha = mix(0.06, 0.9, rim) * (0.8 + 0.2 * breathe * uEnergy);
    vec3 color = mix(vec3(1.0), uColor, 0.35 + 0.65 * rim);
    gl_FragColor = vec4(color, alpha);
  }
`;

function Core({ phase }: { phase: CorePhase }) {
  const tokens = useTokens();
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const nucleus = useRef<THREE.Mesh>(null);
  const shellMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const nucleusMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const glassMaterial = useRef<THREE.ShaderMaterial>(null);
  const ring = useRef<THREE.Group>(null);
  const packets = useRef<THREE.InstancedMesh>(null);
  // Eased toward the phase's values each frame.
  const motion = useRef({ spin: PHASE[phase].spin, flow: PHASE[phase].flow, energy: PHASE[phase].energy, u: 0 });
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uEnergy: { value: 0 } }), []);
  const seeded = useRef(false);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const orbit = useMemo(() => new THREE.EllipseCurve(0, 0, 1.42, 1.42, 0, Math.PI * 2, false, 0), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const target = PHASE[phase];
    const m = motion.current;
    const glass = glassMaterial.current;
    if (!glass) return;
    const color = glass.uniforms.uColor!.value as THREE.Color;
    if (!seeded.current) {
      color.copy(tokens[target.color]);
      seeded.current = true;
    }
    const ease = 1 - Math.exp(-delta * 2.5);
    m.spin += (target.spin - m.spin) * ease;
    m.flow += (target.flow - m.flow) * ease;
    m.energy += (target.energy - m.energy) * ease;
    color.lerp(tokens[target.color], ease);
    shellMaterial.current?.color.copy(color);
    nucleusMaterial.current?.color.copy(color);
    glass.uniforms.uTime!.value = t;
    glass.uniforms.uEnergy!.value = m.energy;

    if (group.current) group.current.position.y = Math.sin(t * 0.8) * 0.04 * (0.4 + m.energy);
    if (shell.current) {
      shell.current.rotation.y += delta * m.spin;
      shell.current.rotation.x += delta * m.spin * 0.35;
    }
    if (nucleus.current) nucleus.current.scale.setScalar(1 + Math.sin(t * 3.2) * 0.08 * m.energy);
    if (ring.current) ring.current.rotation.z += delta * m.spin * 0.25;

    const mesh = packets.current;
    if (!mesh) return;
    m.u = (m.u + delta * m.flow) % 1;
    for (let i = 0; i < PACKETS; i++) {
      const p = orbit.getPointAt((m.u + i / PACKETS) % 1);
      dummy.position.set(p.x, p.y, 0);
      dummy.scale.setScalar(0.6 + 0.4 * m.energy * (0.5 + 0.5 * Math.sin(t * 4 + i)));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[0.86, 64, 64]} />
        <shaderMaterial ref={glassMaterial} uniforms={uniforms} vertexShader={glassVertex} fragmentShader={glassFragment} transparent depthWrite={false} />
      </mesh>
      <mesh ref={nucleus}>
        <icosahedronGeometry args={[0.2, 2]} />
        <meshBasicMaterial ref={nucleusMaterial} toneMapped={false} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshBasicMaterial ref={shellMaterial} wireframe transparent opacity={0.32} toneMapped={false} />
      </mesh>
      <group rotation={[1.12, 0.18, 0]}>
        <group ref={ring}>
          <mesh>
            <torusGeometry args={[1.42, 0.006, 8, 192]} />
            <meshBasicMaterial color={tokens.orbit} transparent opacity={0.7} toneMapped={false} />
          </mesh>
          <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial color={tokens.orbit} toneMapped={false} />
          </instancedMesh>
        </group>
      </group>
      <group rotation={[1.32, -0.42, 0.3]}>
        <mesh>
          <torusGeometry args={[1.78, 0.004, 6, 192]} />
          <meshBasicMaterial color={tokens.ink} transparent opacity={0.12} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

/** Idle, finished and stopped hold still: after a short settle, the scene draws no more frames. */
const SETTLE_MS = 2_500;
const isStill = (p: CorePhase) => p === "idle" || p === "done" || p === "stopped";

export default function AgentCoreScene({ phase, active, onReady, onSlow }: { phase: CorePhase; active: boolean; onReady: () => void; onSlow: () => void }) {
  // A page that opens on a still run starts settled; a run that ends while open eases out first.
  const [settledOn, setSettledOn] = useState<CorePhase | null>(isStill(phase) ? phase : null);
  useEffect(() => {
    if (!isStill(phase)) return;
    const t = setTimeout(() => setSettledOn(phase), SETTLE_MS);
    return () => clearTimeout(t);
  }, [phase]);
  const settled = isStill(phase) && settledOn === phase;

  return (
    <Canvas
      onCreated={fallBackOnContextLoss(onSlow)}
      className="!absolute inset-0"
      style={{ pointerEvents: "none" }}
      frameloop={active && !settled ? "always" : "demand"}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 5.4], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      aria-hidden
    >
      <Core phase={phase} />
      <Ready onReady={onReady} />
      {settled ? null : <FrameGovernor onSlow={onSlow} />}
    </Canvas>
  );
}
