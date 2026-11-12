/**
 * Finding Farbaek devices on the local network: small UDP multicast
 * announcements, only while the person has asked to be visible or to look.
 * An announcement says the protocol, a display name, a key fingerprint and
 * the TCP port; nothing in it is secret or grants anything. Trust comes only
 * from pairing. Networks that isolate clients block this; the window offers
 * connecting by address instead.
 */
import { createSocket, type Socket } from "node:dgram";
import os from "node:os";
import { AnnouncementSchema, DISCOVERY, MESH_PROTOCOL, type Announcement } from "@/core/mesh/protocol";

/** How often a visible device announces itself, and how long a device stays listed after its last announcement. */
const ANNOUNCE_EVERY_MS = 2_000;
const FORGET_AFTER_MS = 10_000;
const MAX_DATAGRAM = 512;
/**
 * Announcements aren't authenticated, so anyone on the network can send them
 * with made-up fingerprints. At most this many devices are listed; a new one
 * then takes the place of the one heard from longest ago.
 */
export const MAX_FOUND = 64;
/** Devices listed from one address at most: a few apps can share a computer, a flood can't. */
export const MAX_PER_ADDRESS = 4;
/**
 * Valid announcements one address may make per window; the rest are
 * ignored. A device sends one every two seconds per network, plus one for
 * each "who".
 */
export const PER_ADDRESS_LIMIT = { count: 20, windowMs: 10_000 } as const;
/** Answers to "who", from this device, at most one per this long, however many ask. */
export const REPLY_EVERY_MS = 1_000;
/** Addresses whose counts are kept at once; beyond that, new addresses wait for the next window. */
const MAX_COUNTED_ADDRESSES = 256;

export interface NearbyDevice {
  name: string;
  fingerprint: string;
  address: string;
  port: number;
  seenAt: number;
}

export interface DiscoveryOptions {
  group?: string;
  port?: number;
  /** What this device announces; port 0 while it's only looking. */
  self: () => Omit<Announcement, "p" | "kind">;
  onChange: () => void;
}

/** This computer's IPv4 addresses on its local networks. */
export function localAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

export class Discovery {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly found = new Map<string, NearbyDevice>();
  /** Valid announcements per source address in the current window. */
  private readonly heard = new Map<string, { count: number; since: number }>();
  private lastReply = 0;
  private readonly group: string;
  private readonly port: number;

  constructor(private readonly options: DiscoveryOptions) {
    this.group = options.group ?? DISCOVERY.group;
    this.port = options.port ?? DISCOVERY.port;
  }

  get running(): boolean {
    return this.socket !== null;
  }

  async start(): Promise<void> {
    if (this.socket) return;
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(this.port, () => {
        socket.off("error", reject);
        resolve();
      });
    });
    socket.on("error", () => undefined);
    socket.on("message", (data, info) => this.onMessage(data, info.address));
    try {
      socket.addMembership(this.group);
    } catch {
      // Joined per interface below.
    }
    for (const address of localAddresses()) {
      try {
        socket.addMembership(this.group, address);
      } catch {
        // Already joined through the default interface, or the interface can't do multicast.
      }
    }
    socket.setMulticastTTL(1);
    socket.setMulticastLoopback(true);
    this.socket = socket;
    this.send("who");
    this.timer = setInterval(() => {
      this.send("here");
      this.expire();
    }, ANNOUNCE_EVERY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
    this.found.clear();
    this.heard.clear();
    this.options.onChange();
  }

  devices(): NearbyDevice[] {
    return [...this.found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Announces now, for example right after becoming visible. */
  announce(): void {
    this.send("here");
  }

  private send(kind: Announcement["kind"]): void {
    const socket = this.socket;
    if (!socket) return;
    const self = this.options.self();
    // A device that's only looking asks who's there but doesn't advertise a port.
    if (kind === "here" && self.port === 0) return;
    const data = Buffer.from(JSON.stringify({ p: MESH_PROTOCOL, kind, ...self } satisfies Announcement));
    const interfaces = localAddresses();
    if (interfaces.length === 0) {
      socket.send(data, this.port, this.group, () => undefined);
      return;
    }
    for (const address of interfaces) {
      try {
        socket.setMulticastInterface(address);
        socket.send(data, this.port, this.group, () => undefined);
      } catch {
        // That interface can't send multicast; the others still do.
      }
    }
  }

  /** Whether this address may be heard now; counts it if so. */
  private allow(address: string, now = Date.now()): boolean {
    const entry = this.heard.get(address);
    if (entry && now - entry.since < PER_ADDRESS_LIMIT.windowMs) {
      if (entry.count >= PER_ADDRESS_LIMIT.count) return false;
      entry.count += 1;
      return true;
    }
    if (!entry && this.heard.size >= MAX_COUNTED_ADDRESSES) {
      for (const [key, e] of this.heard) if (now - e.since >= PER_ADDRESS_LIMIT.windowMs) this.heard.delete(key);
      if (this.heard.size >= MAX_COUNTED_ADDRESSES) return false;
    }
    this.heard.set(address, { count: 1, since: now });
    return true;
  }

  private onMessage(data: Buffer, address: string): void {
    if (data.length > MAX_DATAGRAM) return;
    let json: unknown;
    try {
      json = JSON.parse(data.toString("utf8"));
    } catch {
      return;
    }
    const parsed = AnnouncementSchema.safeParse(json);
    if (!parsed.success) return;
    const a = parsed.data;
    if (a.fingerprint === this.options.self().fingerprint) return;
    // Only valid announcements count against their address.
    if (!this.allow(address)) return;
    const now = Date.now();
    if (a.kind === "who") {
      if (now - this.lastReply < REPLY_EVERY_MS) return;
      this.lastReply = now;
      this.send("here");
      return;
    }
    if (a.port === 0) return;
    const before = this.found.get(a.fingerprint);
    if (!before || before.address !== address) {
      let fromHere = 0;
      for (const d of this.found.values()) if (d.address === address) fromHere += 1;
      if (fromHere >= MAX_PER_ADDRESS) return;
    }
    if (!before && this.found.size >= MAX_FOUND) {
      let oldest: NearbyDevice | null = null;
      for (const d of this.found.values()) if (!oldest || d.seenAt < oldest.seenAt) oldest = d;
      if (oldest) this.found.delete(oldest.fingerprint);
    }
    this.found.set(a.fingerprint, { name: a.name, fingerprint: a.fingerprint, address, port: a.port, seenAt: Date.now() });
    if (!before || before.address !== address || before.port !== a.port || before.name !== a.name) this.options.onChange();
  }

  private expire(): void {
    const now = Date.now();
    for (const [key, e] of this.heard) if (now - e.since >= PER_ADDRESS_LIMIT.windowMs) this.heard.delete(key);
    const cutoff = now - FORGET_AFTER_MS;
    let changed = false;
    for (const [key, device] of this.found) {
      if (device.seenAt < cutoff) {
        this.found.delete(key);
        changed = true;
      }
    }
    if (changed) this.options.onChange();
  }
}
