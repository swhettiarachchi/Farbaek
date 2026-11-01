# Farbaek for Android: the Google Play listing

What goes into Play Console for **Farbaek** (`com.farbaek.app`) under the Svanflok developer account. The steps are in `docs/mobile/android.md`.

Every sentence here is true of the app today. The app is the website (ADR 0099), and it sells nothing inside the app (ADR 0150), so the listing never mentions prices or buying.

## Store listing (English, United States)

**App name:** Farbaek

**Short description** (59 of 80 characters):

> From idea to verified software, with control at every step.

**Full description:**

> Farbaek turns a sentence into working software, and nothing changes without your approval.
>
> Describe what you want, for example a one-page site for your bakery with the menu, opening hours and a map. Farbaek drafts a plan that says what it will and won't do. You approve the plan, then the Farbaek Agent builds it in a sandbox in the cloud.
>
> Every change waits for you
> • See each change as a diff, file by file, with the checks that ran on it.
> • Approve the exact change you reviewed. Each approval is bound to a SHA-256 hash of the change, so anything different needs a new approval.
> • Undo an applied change afterwards, file by file.
>
> Proof you can keep
> • Every finished task has a ProofPack: a signed record of the plan, the changes, the checks and who approved them.
> • Anyone can check a ProofPack at www.farbaek.com/verify.
>
> Build and publish
> • Start from a template or an empty project, or import a GitHub repository.
> • Preview your site, then publish it at its own farbaek.si address or on your own domain.
> • Open a GitHub pull request for each applied change.
>
> Stay in control
> • Choose how much the agent may do on its own, from asking about everything to working within rules you set.
> • Policies, expiring permissions and an activity log show who did what, and when.
> • Invite your team and give each person a role.
>
> Farbaek for Android is the Farbaek web app, full screen. Your work is the same as on www.farbaek.com, in the same account.
>
> New accounts start with a free 14-day trial. No payment details are needed.

## Graphics

All in `desktop/release/store-android/`, made on 2026-11-01 (not in the repository):

| Slot | File | Size |
| --- | --- | --- |
| App icon | `play-icon-512.png` (32-bit, from the app icon) | 512 × 512 |
| Feature graphic | `play-feature-graphic.png` (the logo and the tagline) | 1024 × 500 |
| Phone screenshots | `play-phone-1-mission-control.png` to `play-phone-6-tasks.png` | 1080 × 1920 |

The screenshots are the website's `/app` pages from a local demo build: Mission Control, Build, Approvals, a task, a project and Tasks. Each shows the "Demo workspace. Sample data only." band across the top.

## Store settings

- **App category:** Productivity.
- **Email:** `support@farbaek.com`
- **Website:** `https://www.farbaek.com`
- **Privacy policy:** `https://www.farbaek.com/privacy`

## App content (the owner's answers)

These are declarations, so the owner answers them. Here are the facts to answer from.

- **Sign in details** (formerly App access). Google's reviewers won't create accounts or use free trials, so they get a review account with a password (ADR 0151).
  1. **Make the account.** In the Supabase dashboard, open project `kzcximuvvnnakmrttgzn`, then **Authentication**, **Users**, **Add user**, **Create new user**:
     - email `play-review@farbaek.com`;
     - a long password from your password manager;
     - tick **Auto Confirm User**.
  2. **Sign in once** at https://www.farbaek.com/sign-in/password, so its workspace exists.
  3. **In Play Console:** answer **Yes**, then **Add instructions**:
     - the account's email address and password;
     - in "Any other information":
       > On the sign-in screen, tap "Sign in with a password" under the form, then enter the email address and password above. The account is a normal Farbaek workspace; describe something to build to see a plan, approvals and the build. Nothing in the app is sold.
- **Ads:** No.
- **Content rating:** category "All other app types".
  - No violence, sexual content, profanity, drugs or gambling.
  - **Users interact:** yes.
    - People can invite others into a workspace.
    - Sites people publish on farbaek.si are public.
    - There's no chat between strangers.
- **Target audience:** 13 and over. The Terms set the minimum age (`LEGAL.minimumAge`), and the App Store rating is 13+.
- **Data safety.** Encrypted in transit: yes. People can ask for deletion: yes. Data is never shared: the services in the privacy policy process it for Farbaek, which Play doesn't count as sharing.

  | Data type | Why | Notes |
  | --- | --- | --- |
  | Email address | Account management, app functionality | Required |
  | Name | Account management | Optional: only when signing in with Google or Apple |
  | User IDs | Account management, app functionality | The Farbaek account |
  | Other user-generated content | App functionality | Prompts, project files, approvals |
  | App interactions | App functionality | AI and sandbox usage, so limits work |
  | Purchase history | App functionality | Plans bought on the web are shown in Billing |
  | Device or other IDs | App functionality, security | The notification subscription; IP addresses in sign-in logs |

  - **Deleting an account:** in the app, Settings, then Delete your account.
  - **The web link Play asks for:** `https://www.farbaek.com/privacy#rights`
- **Government app, financial features, health, news:** none.

## Release

- **The bundle:** `farbaek-1.0.0.aab` from the Android workflow, once the owner's upload key is set up (`docs/mobile/android.md`, step 1).
- **Testing:** closed testing first, with at least 12 testers for 14 days, which Google requires of new personal accounts. Then production.
