import type { Metadata } from "next";
import { StudioPage } from "@/components/marketing/studio-page";

export const metadata: Metadata = {
  title: "AI image studio",
  description:
    "Farbaek AI's image studio: describe a picture, choose a style and shape, and get studio light and finish. Edit your own photos, make up to four at once, and keep them in a private library.",
  alternates: { canonical: "/images" },
};

/** Images, Farbaek AI's image studio (stage 201, ADR 0216). */
export default function ImagesPage() {
  return <StudioPage kind="images" />;
}
