import type { Metadata } from "next";
import { StudioPage } from "@/components/marketing/studio-page";

export const metadata: Metadata = {
  title: "AI video studio",
  description:
    "Farbaek AI's video studio: short films with sound from a sentence or one of your pictures, wide or vertical, 4 to 10 seconds, in cinematic, documentary, animated and dithered styles.",
  alternates: { canonical: "/video" },
};

/** Video, Farbaek AI's video studio (stage 201, ADR 0216). */
export default function VideoPage() {
  return <StudioPage kind="video" />;
}
