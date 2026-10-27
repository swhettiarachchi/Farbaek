# Dodo Payments test mode: the owner's steps

Payments run through Dodo Payments (ADR 0100). In test mode nothing real is charged: checkout takes Dodo's test cards only, and only the workspaces you list can open it. Live mode stays off in the code until `docs/billing/go-live.md` is complete, including Dodo's verification of your business.

## 1. In Dodo's dashboard (about 5 minutes)

Turn on **Test Mode** at the top of app.dodopayments.com first. Everything below is the test-mode version.

1. **The API key.** Choose **Developer → API Keys → Add API Key**, name it "Farbaek server (test)", and keep the page open. You'll paste it once in step 2.
2. **The webhook.** Choose **Developer → Webhooks → Add Endpoint**.
   - URL: `https://www.farbaek.com/api/webhooks/dodo`
   - Events (the full list is also on Office Space → Payments):
     - `subscription.active`, `subscription.updated`, `subscription.renewed`, `subscription.plan_changed`;
     - `subscription.past_due`, `subscription.on_hold`, `subscription.paused`, `subscription.unpaused`;
     - `subscription.cancelled`, `subscription.expired`, `subscription.failed`;
     - `payment.succeeded`, `payment.failed`.
   - Create it, open it, and keep its **Signing Secret** (it starts with `whsec_`) ready for step 2.
3. **Your workspace's id.** In Office Space, open **Workspaces**, then your workspace. The id is the last part of the address: 8-4-4-4-12 letters and digits.

## 2. On your computer (3 to 5 minutes)

In PowerShell:

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-dodo.ps1"
```

1. Paste the workspace id.
2. Paste the API key. It shows as stars.
3. Paste the signing secret. It shows as stars.

The script:
- saves all three on the server;
- restarts the app;
- checks that the webhook endpoint now refuses unsigned deliveries (401).

Nothing is saved on your computer.

## 3. Try it

1. **Office Space → Payments → Create test products.** It makes one monthly product per paid plan at Dodo, at Farbaek's prices, and checks each price back.
2. **www.farbaek.com/app/billing:**
   - a "Payments test mode" band shows at the top;
   - choose a plan, tick the agreement, and continue to checkout;
   - pay with one of Dodo's test cards (listed in Dodo's docs under Testing).
3. Back in Billing, the plan shows as **Active** within a minute, with its renewal date. Office Space → Payments lists each webhook as **Applied**.
4. **Try the rest:**
   - **Payment method and invoices** opens Dodo's portal;
   - **Upgrade** shows Dodo's prorated amount before you confirm;
   - **Cancel plan** shows the date your plan ends, and **Keep Pro** undoes it.

When a webhook shows **Failed**, its message says why. **Replay** sends it through again once the cause is fixed.

## Switching off

```
powershell -ExecutionPolicy Bypass -File "C:\Users\INTEL\Documents\FarBaek\scripts\vps\set-dodo.ps1" -Off
```

Billing then says payments aren't connected again. Test subscriptions stay in Dodo's test mode and charge nothing.
