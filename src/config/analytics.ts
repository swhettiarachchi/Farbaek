/**
 * Google Analytics on Farbaek's public pages, only after a visitor allows it
 * (ADR 0155). The measurement ID isn't a secret: every page that loads the
 * tag shows it. Null keeps analytics off everywhere.
 *
 * Property "Farbaek website", web stream https://www.farbaek.com, in the
 * Farbaek Google account's Analytics account "Farbaek".
 */
export const GA_MEASUREMENT_ID: string | null = "G-G0BERESXRT";
