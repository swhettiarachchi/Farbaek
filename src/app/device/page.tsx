import type { Metadata } from "next";
import { ServiceWorker } from "@/components/app/service-worker";
import { DeviceApp } from "@/components/device/device-app";

export const metadata: Metadata = {
  title: "On this device",
  robots: { index: false, follow: false },
};

/**
 * Projects kept in this browser (ADR 0192). A static page with nothing
 * personal in it: everything shown is read from the browser's own storage,
 * so the service worker can keep this page for use with no connection.
 */
export default function DevicePage() {
  return (
    <>
      <DeviceApp />
      <ServiceWorker />
    </>
  );
}
