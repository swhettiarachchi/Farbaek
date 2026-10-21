import { notFound } from "next/navigation";

// Any other path on the office host, so the customer site's 404 never shows here.
export default function OfficeMissing() {
  notFound();
}
