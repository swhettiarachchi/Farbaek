"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

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
