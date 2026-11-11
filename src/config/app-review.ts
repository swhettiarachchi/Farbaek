import { CONTACT } from "./contact";

/**
 * The account Apple's and Google's reviewers sign in with (ADR 0151). Its password is in the store review notes.
 *
 * A store's test purchase is free, so it only counts for workspaces named for testing (ADR 0175), and for a
 * workspace whose only member is this account (ADR 0186). Without that, a reviewer who buys a plan in the store's
 * sandbox would see Farbaek refuse it, and reject the app.
 */
export const APP_REVIEW_ACCOUNT: string = CONTACT.hello;
