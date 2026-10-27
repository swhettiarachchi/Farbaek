# Submitting Farbaek Agent to the Microsoft Store

Everything is prepared; these are the steps that happen in Partner Center (ADR 0098). Farbaek Agent is reserved there as **Farbaek Agent**, Store ID **9N4GNB94KH9M**, and Submission 1 is started as a draft.

What you need:
- `Farbaek-Agent-0.7.0.appx`: built with `pnpm agent:store` (SHA-256 `6c47dc7bd2fb147b9aefc097ac2fff2821f2f6a065cc6e02610493f2c8dd778c`, 157,751,790 bytes);
- the two screenshots;
- the texts in `docs/agent/store-listing.md`.

The appx and screenshots are also in `C:\Users\INTEL\Desktop\Farbaek Store submission`.

Open https://partner.microsoft.com/en-us/dashboard/products/9N4GNB94KH9M/overview, then go through each section.

## 1. Pricing and availability
- **Markets:** leave **All worldwide markets**.
- **Visibility:** **Public audience**, and **Make this product available and discoverable in the Microsoft Store**.
- **Pricing → Base price:** choose **Free**.
- Click **Save draft**.

## 2. Properties
- **Category:** **Developer tools**.
- **Privacy policy URL:** `https://www.farbaek.com/privacy`
- **Website:** `https://www.farbaek.com`
- **Support contact info:** `support@farbaek.com`
- **Product declarations:** leave the defaults, then **Save**.

## 3. Age ratings
1. Start the questionnaire, with the category **Utility, productivity, communication or other**.
2. Answer **No** to violence, sexual content, language, controlled substances, gambling, shared user content and sharing the user's location: the agent does none of these.
3. Save. You'll get a rating, normally 3+ or Everyone.

## 4. Packages
- Drag `Farbaek-Agent-0.7.0.appx` from the Desktop folder into the box. Partner Center checks it, which takes a minute or two.
- **Device families:** **Windows 10/11 Desktop** only.
- Click **Save**.

## 5. Store listings → English (United States)
1. **Description:** paste the "Description" from `docs/agent/store-listing.md`.
2. **Screenshots (Desktop):** add the two PNGs from the Desktop folder.
3. **Short description**, **features** and **search terms:** paste them from the same file.
4. Click **Save**.

## 6. Submission options
- **Publishing hold options:** choose **Don't publish this submission until I select Publish now**. Then nothing goes public until you decide, after certification.
- **Notes for certification:** paste the "Submission notes for certification" from `docs/agent/store-listing.md`.
- **Restricted capabilities** (`runFullTrust`): explain "An Electron desktop app that runs developer commands in a copy of the user's project, after the user approves them."
- Click **Save**.

## 7. Submit for certification
On the overview, click **Submit for certification**. Microsoft usually answers within 1 to 3 business days by email.

When it passes:
1. Install it on this PC from https://apps.microsoft.com/detail/9N4GNB94KH9M (it's held, so only you can see it), pair it, and run one Review Only task.
2. Click **Publish now**.
3. Tell Claude. `AGENT_STORE_URL` in `src/config/agent-download.ts` is then set to `https://apps.microsoft.com/detail/9N4GNB94KH9M`, and the Agents page offers "Get it from the Microsoft Store" first.
