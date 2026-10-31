"use client";

/**
 * The Real-Project Loom in 3D (ADR 0142): a project's real lanes as a
 * slowly turning field of stages. Every node is a record: pointing at one
 * names it, clicking opens it. Drag to turn it. Loaded lazily by ProjectLoom,
 * only on capable desktops, only when the person turns it on, and paused
 * off-screen; the 2D lanes on the same page list everything it shows.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FrameGovernor } from "./frame-governor";
import type { LoomEdge, LoomNode } from "./project-loom-layout";

function Edges({ edges, solid }: { edges: readonly LoomEdge[]; solid: boolean }) {
  const geometry = useMemo(() => {
    const points = edges.filter((e) => e.solid === solid).flatMap((e) => [...e.from, ...e.to]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, [edges, solid]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={solid ? "#2450f0" : "#9aa0aa"} transparent opacity={solid ? 0.75 : 0.35} />
    </lineSegments>
  );
}

function Field({ nodes, edges, hovered, onHover, onOpen }: { nodes: readonly LoomNode[]; edges: readonly LoomEdge[]; hovered: string | null; onHover(n: LoomNode | null): void; onOpen(n: LoomNode): void }) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef<{ on: boolean; x: number }>({ on: false, x: 0 });
  const canvas = useThree((state) => state.gl.domElement);
  // Dragging turns the field; it turns slowly by itself otherwise.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      drag.current = { on: true, x: e.clientX };
    };
    const move = (e: PointerEvent) => {
      if (!drag.current.on || !group.current) return;
      group.current.rotation.y += (e.clientX - drag.current.x) * 0.006;
      drag.current.x = e.clientX;
    };
    const up = () => {
      drag.current.on = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [canvas]);
  useFrame((_, delta) => {
    if (group.current && !drag.current.on) group.current.rotation.y += delta * 0.06;
  });
  return (
    <group ref={group} rotation={[0, -0.35, 0]}>
      <Edges edges={edges} solid />
      <Edges edges={edges} solid={false} />
      {nodes.map((n) => (
        <mesh
          key={n.id}
          position={n.position}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(n);
            document.body.style.cursor = n.href ? "pointer" : "default";
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = "default";
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onOpen(n);
          }}
        >
          <sphereGeometry args={[n.state === "not_yet" ? 0.17 : 0.27, 24, 24]} />
          <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={hovered === n.id ? 0.55 : 0.12} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

export default function ProjectLoomScene({
  nodes,
  edges,
  running,
  hovered,
  onHover,
  onOpen,
  onSlow,
}: {
  nodes: readonly LoomNode[];
  edges: readonly LoomEdge[];
  running: boolean;
  hovered: string | null;
  onHover(n: LoomNode | null): void;
  onOpen(n: LoomNode): void;
  onSlow(): void;
}) {
  return (
    <Canvas
      frameloop={running ? "always" : "never"}
      camera={{ position: [0, 6, 10.5], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 8, 6]} intensity={0.9} />
      <Field nodes={nodes} edges={edges} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      <FrameGovernor onSlow={onSlow} />
    </Canvas>
  );
}
