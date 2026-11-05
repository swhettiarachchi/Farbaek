"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

/** For a Canvas's onCreated: a lost WebGL context, which phones do under memory pressure, falls back to the still (ADR 0172). */
export function fallBackOnContextLoss(onSlow: () => void) {
  return ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    gl.domElement.addEventListener("webglcontextlost", (event) => {
      // React Three Fiber loses the context on purpose when a scene closes, and that isn't the device failing.
      if (!gl.domElement.isConnected) return;
      event.preventDefault();
      onSlow();
    });
  };
}

/** Drops back to the static version if the device can't hold a smooth frame rate. */
export function FrameGovernor({ onSlow }: { onSlow: () => void }) {
  const samples = useRef<number[]>([]);
  const done = useRef(false);
  useFrame((_, delta) => {
    if (done.current) return;
    samples.current.push(delta);
    if (samples.current.length < 90) return;
    done.current = true;
    const settled = samples.current.slice(20);
    const avg = settled.reduce((a, b) => a + b, 0) / settled.length;
    if (avg > 1 / 24) onSlow();
  });
  return null;
}
