# Dodo Payments live: the owner's steps

Live payments charge real money. They start only after the three steps below. The last one is recorded in the audit log.

## 1. In Dodo's dashboard, with **Live Mode** on (bottom left)

1. **The API key.** Choose **Developer → API Keys → Add API Key**:
   - name: "Farbaek server (live)";
   - IP Allowlist: `2.25.88.188/32`;
   - **Read** on Payments (top-ups check each payment with Dodo before adding usage);
   - **Write** on Subscriptions, Products, Customers and Checkout Sessions, and **None** on the rest;
   - click **Create Key** and keep the page open.
2. **The webhook.** Claude adds it in test mode the same way. In Live Mode, check that **Developer → Webhooks** has `https://www.farbaek.com/api/webhooks/dodo`, with every `subscription.*` event plus `payment.succeeded` and `payment.failed`. Open it and keep its **Signing Secret** ready.
3. **Settings → Pricing** (Live Mode): Adaptive Currency **on**, Adaptive Currency Fees Inclusive **off**, Charm Pricing **off**.

## 2. On your computer

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-dodo.ps1" -Live
```

Paste the live API key, then the live signing secret; both show as stars. No payment can be taken yet.

## 3. In Office Space → Payments

1. **Create live products:** nine plans (Lite and Maker are yearly, ADR 0105) and three top-up packs. Each should say **Matches**. Clicking it again later adds only what's missing.
2. **Go live:** tick the box approving the Terms' Paid plans section, write a reason, enter your authenticator code, and click **Turn on live payments**.

**What happens:**
- checkout opens to every workspace;
- your own test plan and test top-ups end, so the workspace goes back to Free;
- the test-mode band disappears.

**Turning live off:** the same card has **Turn off live payments**, with a reason and a code. New checkouts stop; running subscriptions continue at Dodo.
