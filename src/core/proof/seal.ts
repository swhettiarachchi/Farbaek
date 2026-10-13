/**
 * Geometry for the ProofPack Seal: a guilloche rosette derived entirely from
 * a SHA-256 digest. Two different digests give visibly different seals, and
 * the outer tick ring encodes all 64 hex digits, one tick per nibble.
 *
 * The Seal is shown only for verified ProofPacks (or clearly labelled samples).
 */

export interface SealLayer {
  d: string;
  opacity: number;
}

export interface SealGeometry {
  size: number;
  center: number;
  outerRadius: number;
  textRadius: number;
  innerRadius: number;
  layers: SealLayer[];
  ticks: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

function round(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function sealGeometry(hashHex: string, size = 240): SealGeometry {
  if (!HEX64.test(hashHex)) throw new Error("sealGeometry expects a lowercase 64-character SHA-256 hex digest");

  const bytes = Array.from({ length: 32 }, (_, i) => parseInt(hashHex.slice(i * 2, i * 2 + 2), 16));
  const byte = (i: number) => bytes[i % 32]!;
  const center = size / 2;
  const outerRadius = size * 0.47;
  const textRadius = outerRadius * 0.845;
  const innerRadius = outerRadius * 0.76;

  const layers: SealLayer[] = [];
  for (let k = 0; k < 4; k++) {
    const n = 5 + (byte(k) % 13); // (n + 1)-fold symmetry: 6 to 18 lobes
    const reach = innerRadius * (0.94 - k * 0.17);
    const ratio = 0.16 + (byte(k + 4) / 255) * 0.2;
    const rotation = (byte(k + 8) / 255) * ((2 * Math.PI) / (n + 1));
    const samples = (n + 1) * 14;

    for (let strand = 0; strand < 2; strand++) {
      const b = reach * ratio * (1 - strand * 0.14);
      const a = reach - b;
      let d = "";
      for (let i = 0; i <= samples; i++) {
        const t = (2 * Math.PI * i) / samples;
        const x0 = a * Math.cos(t) + b * Math.cos(n * t);
        const y0 = a * Math.sin(t) - b * Math.sin(n * t);
        const x = center + x0 * Math.cos(rotation) - y0 * Math.sin(rotation);
        const y = center + x0 * Math.sin(rotation) + y0 * Math.cos(rotation);
        d += `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
      }
      layers.push({ d: `${d}Z`, opacity: strand === 0 ? 0.9 - k * 0.12 : 0.45 - k * 0.06 });
    }
  }

  let ticks = "";
  for (let i = 0; i < 64; i++) {
    const nibble = parseInt(hashHex[i]!, 16);
    const angle = (2 * Math.PI * i) / 64 - Math.PI / 2;
    const r1 = outerRadius;
    const r2 = outerRadius - 2 - (nibble / 15) * 5;
    ticks += `M${round(center + r1 * Math.cos(angle))} ${round(center + r1 * Math.sin(angle))}L${round(center + r2 * Math.cos(angle))} ${round(center + r2 * Math.sin(angle))}`;
  }

  return { size, center, outerRadius, textRadius, innerRadius, layers, ticks };
}
