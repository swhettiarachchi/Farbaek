/**
 * The Survey Studio engine's version (ADR 0198). It is stamped on every
 * computed result and every export, so a figure on a plan can always be traced
 * to the exact code that produced it. Raise it whenever a calculation, a
 * rounding rule or an export format changes.
 */
/*
 * 2.0.0 (stage 191): several lots, roads, adjoining lands and the classic
 * sheet. Plans approved under 1.0.0 show as "approval no longer applies" until
 * a new version is saved and approved: the engine that drew them changed.
 */
export const SURVEY_ENGINE_VERSION = "survey-engine/2.0.0";
