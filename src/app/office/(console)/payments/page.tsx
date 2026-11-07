import { CheckCircleIcon, CircleDashedIcon, ClockIcon, InfoIcon, ProhibitIcon, SkullIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { AdminTable, Cell, Chip } from "@/components/admin/table";
import { OfficeActionForm } from "@/components/office/action-form";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { BILLABLE_PLANS, PLAN_CATALOG_VERSION, chargeLine, formatUsd, getPlan } from "@/core/billing/catalog";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { TOPUP_PACKS_CENTS } from "@/core/billing/topups";
import { billingStatus, readProviderConfig, requestedBillingMode } from "@/server/billing/config";
import { ReasonField, StepUpField } from "@/components/office/fields";
import { PAID_TERMS_VERSION } from "@/config/legal";
import { paymentsLiveSince, refreshPlatformState } from "@/server/platform/state";
import { createDodoClient } from "@/server/billing/providers/dodo/client";
import { requireStaff } from "@/server/office/access";
import { readPaymentsPage, type WebhookEventRow } from "@/server/office/payments-data";
import { createProductsAction, endLiveAction, goLiveAction, replayWebhookAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };

/** The events Dodo's webhook endpoint should send (spec §23.3). Farbaek re-reads the subscription for each. */
const EVENTS = [
  "subscription.active",
  "subscription.updated",
  "subscription.renewed",
  "subscription.plan_changed",
  "subscription.past_due",
  "subscription.on_hold",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.cancelled",
  "subscription.expired",
  "subscription.failed",
  "payment.succeeded",
  "payment.failed",
];

const STATUS: Record<WebhookEventRow["status"], { label: string; tone: "neutral" | "verified" | "approval" | "failed"; icon: typeof CheckCircleIcon }> = {
  received: { label: "Waiting", tone: "neutral", icon: ClockIcon },
  processing: { label: "Processing", tone: "neutral", icon: CircleDashedIcon },
  processed: { label: "Applied", tone: "verified", icon: CheckCircleIcon },
  ignored: { label: "Ignored", tone: "neutral", icon: ProhibitIcon },
  failed: { label: "Failed, retrying", tone: "approval", icon: WarningCircleIcon },
  dead: { label: "Gave up", tone: "failed", icon: SkullIcon },
};

type Check = { kind: "match" } | { kind: "differs"; text: string } | { kind: "unknown"; text: string };

export default async function OfficePayments() {
  const staff = await requireStaff();
  const page = await readPaymentsPage(staff.admin);
  await refreshPlatformState(true);
  // The provider's keys whether or not live is confirmed yet, so live products can be made and checked first.
  const config = readProviderConfig();
  const status = billingStatus();
  const liveSince = paymentsLiveSince();
  const canGoLive = staff.can("billing.go_live");
  const requested = requestedBillingMode();
  const canCreate = staff.can("billing.products");
  const canReplay = staff.can("billing.replay");
  const mode = config?.mode ?? null;

  const paidPlans = BILLABLE_PLANS.filter((p) => p.pricing.kind === "paid" && isPaidPlanId(p.id));
  const current = (page?.products ?? []).filter((p) => p.mode === (mode ?? "test") && p.catalogVersion === PLAN_CATALOG_VERSION);

  // Reconciliation: each product's price as Dodo has it, against the catalog. Read live, only when connected.
  const dodo = config ? createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: config.mode }) : null;
  const checks = new Map<string, Check>(
    await Promise.all(
      current.map(async (p): Promise<[string, Check]> => {
        if (!dodo) return [p.productId, { kind: "unknown", text: "Not connected" }];
        const r = await dodo.getProductPrice(p.productId);
        if (!r.ok) return [p.productId, { kind: "unknown", text: `Couldn't check (${r.code})` }];
        const v = r.value;
        const plan = isPaidPlanId(p.planId) ? getPlan(p.planId) : null;
        const every = plan?.pricing.kind === "paid" ? plan.pricing.interval : "month";
        if (v.amountCents !== p.amountCents || v.currency !== p.currency || !v.recurring || v.trialDays !== 0 || (v.interval !== null && v.interval !== every))
          return [p.productId, { kind: "differs", text: `Dodo has ${v.currency} ${(v.amountCents / 100).toFixed(2)}${v.recurring ? (v.interval ? ` a ${v.interval}` : "") : ", one-time"}${v.trialDays ? `, ${v.trialDays} trial days` : ""}` }];
        return [p.productId, { kind: "match" }];
      }),
    ),
  );
  const missing = paidPlans.filter((p) => !current.some((c) => c.planId === p.id));
  // Top-up packs (ADR 0102): one-time products, checked the same way.
  const packs = (page?.topups ?? []).filter((t) => t.mode === (mode ?? "test") && t.catalogVersion === PLAN_CATALOG_VERSION);
  const missingPacks = TOPUP_PACKS_CENTS.filter((c) => !packs.some((t) => t.packCents === c));
  const packChecks = new Map<string, Check>(
    await Promise.all(
      packs.map(async (t): Promise<[string, Check]> => {
        if (!dodo) return [t.productId, { kind: "unknown", text: "Not connected" }];
        const r = await dodo.getProductPrice(t.productId);
        if (!r.ok) return [t.productId, { kind: "unknown", text: `Couldn't check (${r.code})` }];
        const v = r.value;
        if (v.amountCents !== t.packCents || v.currency !== "USD" || v.recurring) return [t.productId, { kind: "differs", text: `Dodo has ${v.currency} ${(v.amountCents / 100).toFixed(2)}${v.recurring ? ", recurring" : ""}` }];
        return [t.productId, { kind: "match" }];
      }),
    ),
  );
  const toCreate = missing.length + missingPacks.length;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Payments"
        description={`Dodo Payments: the products checkout charges for, and every webhook Farbaek received.${liveSince ? "" : " Live payments stay off until the go-live checklist is complete."}`}
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <h2 className="text-lg font-medium">Connection</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-ink">
            {status.on && requested === "live" ? (
              <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-verified" aria-hidden />
            ) : status.on ? (
              <InfoIcon size={18} weight="bold" className="mt-px shrink-0 text-approval" aria-hidden />
            ) : (
              <CircleDashedIcon size={18} weight="bold" className="mt-px shrink-0 text-ink-3" aria-hidden />
            )}
            <span>
              <span className="font-medium">{status.on ? (requested === "live" ? "Live mode." : "Test mode.") : requested === "live" ? "Not live yet." : "Not connected."}</span> {status.detail}.
            </span>
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Webhook endpoint (add it in Dodo&apos;s dashboard, Developer, Webhooks)</dt>
              <dd className="mt-1 break-all font-mono text-[0.8125rem]">https://www.farbaek.com/api/webhooks/dodo</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Settings on the server (names only)</dt>
              <dd className="mt-1 break-all font-mono text-[0.8125rem]">BILLING_MODE, DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_KEY, BILLING_TEST_WORKSPACES</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">The owner sets them with scripts/vps/set-dodo.ps1. Values are never shown here.</p>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Events to send</h2>
          <p className="mt-1 text-sm text-ink-2">Subscribe the endpoint to these. Farbaek reads the subscription again from Dodo for each one, so order and repeats don&apos;t matter.</p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {EVENTS.map((e) => (
              <li key={e} className="rounded-full border border-line px-2.5 py-1 font-mono text-xs text-ink-2">
                {e}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-medium">Go live</h2>
        {liveSince ? (
          <>
            <p className="mt-3 flex items-start gap-2 text-sm text-ink">
              <CheckCircleIcon size={18} weight="fill" className="mt-px shrink-0 text-verified" aria-hidden />
              <span>
                <span className="font-medium">Live payments since <LocalTime iso={liveSince} />.</span> Checkout is open to every workspace, and real money is charged.
              </span>
            </p>
            {canGoLive ? (
              <div className="mt-5">
                <OfficeActionForm action={endLiveAction} submit="Turn off live payments" tone="danger" className="grid gap-4 sm:max-w-md">
                  <p className="text-sm text-ink-2">New checkouts stop at once. Subscriptions already running continue at Dodo Payments until they&apos;re cancelled there or in Billing.</p>
                  <ReasonField id="end-live-reason" />
                  <StepUpField id="end-live-totp" />
                </OfficeActionForm>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-2">Live payments need all four, then an owner&apos;s confirmation here. It&apos;s recorded in the audit log.</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {[
                { done: requested === "live" && config?.mode === "live", text: "Live Dodo keys on the server", how: "Run scripts/vps/set-dodo.ps1 -Live" },
                {
                  done: (page?.products ?? []).filter((p) => p.mode === "live" && p.catalogVersion === PLAN_CATALOG_VERSION).length >= paidPlans.length && (page?.topups ?? []).filter((t) => t.mode === "live").length >= TOPUP_PACKS_CENTS.length,
                  text: "Live products for every plan and top-up",
                  how: "Create them below, once the live keys are set",
                },
                { done: null, text: "The live webhook endpoint in Dodo (Live Mode, Developer, Webhooks)", how: "https://www.farbaek.com/api/webhooks/dodo, the same events as test" },
                { done: null, text: `The Terms' Paid plans section, version ${PAID_TERMS_VERSION}`, how: "Read it at www.farbaek.com/terms#paid-plans" },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2">
                  {item.done === true ? (
                    <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                  ) : item.done === false ? (
                    <CircleDashedIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  ) : (
                    <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-hidden />
                  )}
                  <span>
                    <span className="text-ink">{item.text}</span>
                    <span className="block text-xs text-ink-3">{item.done === true ? "Done" : item.done === false ? item.how : `Check by hand: ${item.how}`}</span>
                  </span>
                </li>
              ))}
            </ul>
            {canGoLive && config?.mode === "live" ? (
              <div className="mt-5">
                <OfficeActionForm action={goLiveAction} submit="Turn on live payments" tone="danger" className="grid gap-4 sm:max-w-md">
                  <p className="text-sm text-ink-2">Checkout opens to every workspace and charges real money. Every test-mode plan and test top-up ends, so a test card never counts as a payment.</p>
                  <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
                    <input type="checkbox" name="terms" value={PAID_TERMS_VERSION} required className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                    <span>I approve the Terms&apos; Paid plans section, version {PAID_TERMS_VERSION}, and the go-live checklist.</span>
                  </label>
                  <ReasonField id="go-live-reason" />
                  <StepUpField id="go-live-totp" />
                </OfficeActionForm>
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-3">{!canGoLive ? "Only an owner turns on live payments." : "Set the live keys first: scripts/vps/set-dodo.ps1 -Live."}</p>
            )}
          </>
        )}
      </Card>

      {!page ? <Notice tone="warning">The payment tables couldn&apos;t be read. Migration v62 may not be applied on this database yet.</Notice> : null}

      <section aria-labelledby="products-heading" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="products-heading" className="text-lg font-medium">
              Products
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              One product per paid plan (Lite and Maker yearly, plus their monthly versions), for price list <span className="font-mono text-[0.8125rem]">{PLAN_CATALOG_VERSION}</span>. Checkout pauses for a plan whose price at Dodo differs.
            </p>
          </div>
        </div>
        <AdminTable caption="Products per plan" columns={["Plan", "Farbaek price", "Dodo product", "Check"]}>
          {paidPlans.map((p) => {
            const row = current.find((c) => c.planId === p.id);
            const check = row ? checks.get(row.productId) : undefined;
            return (
              <tr key={p.id} className="border-b border-line last:border-0">
                <Cell>{p.name}</Cell>
                <Cell mono>{p.pricing.kind === "paid" ? chargeLine(p) : ""}</Cell>
                <Cell mono muted={!row}>
                  {row ? row.productId : "Not created"}
                </Cell>
                <Cell>
                  {!row ? (
                    <Chip>
                      <CircleDashedIcon size={14} className="mr-1" aria-hidden /> Missing
                    </Chip>
                  ) : check?.kind === "match" ? (
                    <Chip tone="verified">
                      <CheckCircleIcon size={14} weight="fill" className="mr-1" aria-hidden /> Matches
                    </Chip>
                  ) : check?.kind === "differs" ? (
                    <Chip tone="failed">
                      <XCircleIcon size={14} weight="fill" className="mr-1" aria-hidden /> {check.text}
                    </Chip>
                  ) : (
                    <Chip>
                      <CircleDashedIcon size={14} className="mr-1" aria-hidden /> {check?.text ?? "Couldn't check"}
                    </Chip>
                  )}
                </Cell>
              </tr>
            );
          })}
          {TOPUP_PACKS_CENTS.map((cents) => {
            const row = packs.find((t) => t.packCents === cents);
            const check = row ? packChecks.get(row.productId) : undefined;
            return (
              <tr key={`topup-${cents}`} className="border-b border-line last:border-0">
                <Cell>Top-up {formatUsd(cents)}</Cell>
                <Cell mono>{formatUsd(cents)} once</Cell>
                <Cell mono muted={!row}>
                  {row ? row.productId : "Not created"}
                </Cell>
                <Cell>
                  {!row ? (
                    <Chip>
                      <CircleDashedIcon size={14} className="mr-1" aria-hidden /> Missing
                    </Chip>
                  ) : check?.kind === "match" ? (
                    <Chip tone="verified">
                      <CheckCircleIcon size={14} weight="fill" className="mr-1" aria-hidden /> Matches
                    </Chip>
                  ) : check?.kind === "differs" ? (
                    <Chip tone="failed">
                      <XCircleIcon size={14} weight="fill" className="mr-1" aria-hidden /> {check.text}
                    </Chip>
                  ) : (
                    <Chip>
                      <CircleDashedIcon size={14} className="mr-1" aria-hidden /> {check?.text ?? "Couldn't check"}
                    </Chip>
                  )}
                </Cell>
              </tr>
            );
          })}
        </AdminTable>
        {toCreate > 0 ? (
          canCreate && config ? (
            <OfficeActionForm action={createProductsAction} submit={`Create ${toCreate} ${config?.mode ?? "test"} ${toCreate === 1 ? "product" : "products"} in Dodo`} className="grid gap-3">
              <p className="text-sm text-ink-2">
                Creates {[...missing.map((p) => p.name), ...missingPacks.map((c) => `the ${formatUsd(c)} top-up`)].join(", ")} at Dodo Payments in {config?.mode ?? "test"} mode. Plans are monthly, renewing until cancelled, with no provider trial; top-ups are paid once. Tax is added at checkout.
              </p>
            </OfficeActionForm>
          ) : (
            <p className="text-sm text-ink-3">
              {!config ? "Products can be created once the Dodo keys are set on the server." : "Only an owner creates products, since they set what checkout charges."}
            </p>
          )
        ) : null}
      </section>

      <section aria-labelledby="events-heading" className="grid gap-4">
        <div>
          <h2 id="events-heading" className="text-lg font-medium">
            Webhook events
          </h2>
          <p className="mt-1 text-sm text-ink-2">The latest 50. Failed events retry after 1, 5 and 30 minutes, then 2, 5 and 10 hours, and stop after 8 attempts.</p>
        </div>
        {page && page.events.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">No webhooks yet. They appear here as soon as Dodo sends one.</p>
        ) : (
          <AdminTable caption="Webhook events" columns={["Received", "Event", "Status", "Workspace", "Webhook id", ""]}>
            {(page?.events ?? []).map((e) => {
              const s = STATUS[e.status];
              const StatusIcon = s.icon;
              return (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Cell>
                    <RelativeTime iso={e.receivedAt} />
                    <span className="block text-xs text-ink-3">
                      <LocalTime iso={e.receivedAt} />
                    </span>
                  </Cell>
                  <Cell mono>
                    {e.type}
                    {e.mode === "test" ? <span className="ml-1.5 font-sans text-xs text-ink-3">test</span> : null}
                  </Cell>
                  <Cell>
                    <Chip tone={s.tone}>
                      <StatusIcon size={14} weight="bold" className="mr-1" aria-hidden /> {s.label}
                    </Chip>
                    {e.attempts > 1 ? <span className="mt-1 block text-xs text-ink-3">{e.attempts} attempts</span> : null}
                    {e.lastError ? <span className="mt-1 block max-w-64 text-xs text-ink-2">{e.lastError}</span> : null}
                  </Cell>
                  <Cell mono muted={!e.orgId}>
                    {e.orgId ? (
                      <Link href={`/workspaces/${e.orgId}`} className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline">
                        {e.orgId.slice(0, 8)}
                      </Link>
                    ) : (
                      "None"
                    )}
                  </Cell>
                  <Cell mono muted>
                    <span className="block max-w-40 truncate" title={e.webhookId}>
                      {e.webhookId}
                    </span>
                  </Cell>
                  <Cell>
                    {canReplay && (e.status === "failed" || e.status === "dead") ? (
                      <OfficeActionForm action={replayWebhookAction} submit="Replay" tone="secondary" className="grid gap-2">
                        <input type="hidden" name="id" value={e.id} />
                      </OfficeActionForm>
                    ) : null}
                  </Cell>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </section>
    </div>
  );
}
