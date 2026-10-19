"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const SEEN_KEY = "farbaek.seals-seen";
const KEEP = 60;

function seenList(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markSeen(hash: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([hash, ...seenList().filter((h) => h !== hash)].slice(0, KEEP)));
  } catch {
    // Without storage the Seal forms again next time, which does no harm.
  }
}

const noSubscribe = () => () => {};

/**
 * The verified Seal forming in 3D, once (Phase C): the first time a person
 * sees a verified ProofPack, its Seal tilts up out of perspective while its
 * rings and rosette draw in. It waits until the Seal is on screen. After
 * that, and always under reduced motion or on the server, it's simply there.
 * Only ever wraps a verified Seal.
 */
export function SealReveal({ hash, className = "", children }: { hash: string; className?: string; children: React.ReactNode }) {
  const fresh = useSyncExternalStore(noSubscribe, () => !seenList().includes(hash), () => false);
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || !fresh) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fresh]);

  // Until it's on screen a fresh Seal is held at its first frame, so it never forms out of sight.
  const state = !fresh ? "" : inView ? "is-forming" : "is-waiting";
  return (
    <div
      ref={box}
      className={`seal-reveal ${state} ${className}`}
      onAnimationEnd={(e) => {
        if (e.animationName === "seal-tilt") markSeen(hash);
      }}
    >
      {children}
    </div>
  );
}
