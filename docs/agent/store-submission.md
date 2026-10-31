# Submitting Farbaek Agent to the Microsoft Store

Farbaek Agent is reserved in Partner Center as **Farbaek Agent**, Store ID **9N4GNB94KH9M** (ADR 0098). Submission 1 is a draft with everything filled in except the package, which only a person can add: Partner Center takes it by drag and drop or a file picker, and it's too large for any other route.

The package:
- `Farbaek-Agent-0.9.0.appx`, built with `pnpm agent:store` on 2026-10-31 (SHA-256 `4044426b438f106daf020eb177ac63a7a37201856f03635662af1969e49e7d2a`, 157,765,988 bytes);
- with local models, Mesh delta sends and the offline queue, Continue on my computer, and tools from MCP servers;
- also in `C:\Users\INTEL\Desktop\Farbaek Store submission`.

## Done (2026-10-31)

- **Pricing and availability:** all markets, public and discoverable, free.
- **Properties:** Developer tools; privacy policy `https://www.farbaek.com/privacy`, website `https://www.farbaek.com`, support `support@farbaek.com`.
- **Age ratings:** the IARC questionnaire, answered as recorded in `docs/agent/store-listing.md`. The rating is 3+ in every region, with "Users Interact" (Nearby can send folders to another person's paired device). The IARC Terms of Use were accepted on the owner's instruction to publish.
- **Store listing, English (United States):**
  - the description, short description and ten features from `docs/agent/store-listing.md`;
  - the two screenshots (1366×768, sample data only);
  - six keywords, since the Store refuses the product's own name as one;
  - developed by Farbaek.

  English was added as a listing language by hand. Once the package is in, it also appears as a language the package supports.
- **Submission options:** publish as soon as it passes certification, as the owner asked on 2026-10-31.
- **Notes for certification** (Additional Testing Information): why `runFullTrust` and `privateNetworkClientServer`, and how to try it with a free account. No credentials are given; the testers sign up themselves.

## Left for the owner

1. Open https://partner.microsoft.com/en-us/dashboard/products/9N4GNB94KH9M/overview and go to **Packages**.
2. Drag `Farbaek-Agent-0.9.0.appx` from the Desktop folder into the box. Partner Center checks it, which takes a minute or two.
3. **Device families:** tick **Windows 10/11 Desktop** only, then click **Save**.
4. If Partner Center asks about **restricted capabilities** (`runFullTrust`), paste: "An Electron desktop app that runs developer commands in a copy of the user's project, after the user approves them."
5. Back on the overview, every section should say **Complete**. Click **Submit for certification**.

Microsoft usually answers within 1 to 3 business days by email. When it passes, it goes public by itself. Then:
1. Install it on this PC from https://apps.microsoft.com/detail/9N4GNB94KH9M, pair it and run one Review Only task.
2. Tell Claude. `AGENT_STORE_URL` in `src/config/agent-download.ts` is then set to `https://apps.microsoft.com/detail/9N4GNB94KH9M`, and the Agents page offers "Get it from the Microsoft Store" first.

If certification fails, the email names the policy. Send it to Claude: the fix goes into a new appx and a new submission.
