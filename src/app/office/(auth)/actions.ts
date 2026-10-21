"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { officeClients } from "@/server/office/access";
import { requestMeta } from "@/server/office/request-meta";
import { requestStaffCode, startEnrollment, verifySecondFactor, verifyStaffCode, type SignInDeps } from "@/server/office/sign-in";
import { officeAuth } from "@/server/office/supabase-auth";

/** The sign-in steps run only on the office host, for requests made by the office itself. */
async function deps(): Promise<SignInDeps | null> {
  const clients = await officeClients();
  if (!clients) return null;
  const h = await headers();
  const origin = h.get("origin");
  if (origin ? origin !== clients.office.origin : h.get("sec-fetch-site") !== "same-origin") return null;
  return { auth: officeAuth(clients.client), store: clients.store, office: clients.office, meta: await requestMeta(), now: () => new Date() };
}

const REFUSED = "This request didn't come from Office Space.";

export type EmailState = { step: "email" | "code"; email: string; message: string | null; error: boolean };

export async function requestCodeAction(_prev: EmailState, form: FormData): Promise<EmailState> {
  const d = await deps();
  if (!d) return { step: "email", email: "", message: REFUSED, error: true };
  const r = await requestStaffCode(d, form.get("email"));
  if (r.status === "error") return { step: "email", email: r.email, message: r.message, error: true };
  return { step: "code", email: r.email, message: null, error: false };
}

export async function verifyCodeAction(prev: EmailState, form: FormData): Promise<EmailState> {
  const d = await deps();
  if (!d) return { ...prev, message: REFUSED, error: true };
  const r = await verifyStaffCode(d, form.get("email"), form.get("code"));
  if (r.status === "verify" || r.status === "enroll") redirect(r.status === "verify" ? "/verify" : "/enroll");
  if (r.status === "not_staff") redirect("/not-staff");
  return { ...prev, step: "code", message: r.message, error: true };
}

export type FactorState = { message: string | null };

export async function verifyTotpAction(_prev: FactorState, form: FormData): Promise<FactorState> {
  const d = await deps();
  if (!d) return { message: REFUSED };
  const r = await verifySecondFactor(d, null, form.get("code"), false);
  return finish(r);
}

export type EnrollState = { status: "idle" } | { status: "ready"; factorId: string; qr: string; secret: string; uri: string } | { status: "error"; message: string };

export async function beginEnrollAction(): Promise<EnrollState> {
  const d = await deps();
  if (!d) return { status: "error", message: REFUSED };
  const r = await startEnrollment(d);
  if (r.status === "sign_in") redirect("/sign-in");
  if (r.status === "error") return r;
  return { status: "ready", factorId: r.factorId, qr: r.qr, secret: r.secret, uri: r.uri };
}

export async function finishEnrollAction(_prev: FactorState, form: FormData): Promise<FactorState> {
  const d = await deps();
  if (!d) return { message: REFUSED };
  const factorId = form.get("factorId");
  if (typeof factorId !== "string" || !factorId) return { message: "Start again: show the QR code first." };
  return finish(await verifySecondFactor(d, factorId, form.get("code"), true));
}

function finish(r: Awaited<ReturnType<typeof verifySecondFactor>>): FactorState {
  if (r.status === "in") redirect(r.welcome ? "/?welcome=1" : "/");
  if (r.status === "not_staff") redirect("/not-staff");
  if (r.status === "sign_in") redirect("/sign-in");
  return { message: r.message };
}
