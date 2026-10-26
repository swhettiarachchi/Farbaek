import type { Socket } from "node:dgram";

export const MAGIC_COOKIE: number;
export const MAX_REQUEST: number;
export const LIMIT: { requests: number; windowMs: number };
export function parseRequest(msg: Buffer): Buffer | null;
export function xorMappedAddress(address: string, port: number, transactionId: Buffer): Buffer;
export function ipv6Bytes(address: string): Buffer;
export function buildResponse(transactionId: Buffer, address: string, port: number): Buffer;
export function createLimiter(limit?: { requests: number; windowMs: number }, now?: () => number): { allow(address: string): boolean; sweep(): void; readonly size: number };
export function createStunServer(options?: { port?: number; host?: string; limit?: { requests: number; windowMs: number } }): Promise<Socket>;
