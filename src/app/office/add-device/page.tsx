import type { Metadata } from "next";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: { absolute: "Device code" } };

/**
 * Where a new device types its device-add code (ADR 0072). The only office
 * page an unknown device can open, so it names nothing: no product, no sign-in.
 */
export default function AddDevice() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-12">
      <div className="grid w-full max-w-sm gap-5">
        <div>
          <h1 className="text-2xl font-medium tracking-[-0.02em]">Enter your device code</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">Type the 8-character code shown on your other device. It works once, for 15 minutes.</p>
        </div>
        <CodeForm />
      </div>
    </main>
  );
}
