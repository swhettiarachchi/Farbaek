/**
 * The model a turn asks for (stage 285, ADR 0293).
 *
 * Kept apart from models.ts on purpose: the browser needs only this, and models.ts reaches the plan catalog, which the
 * browser must never download (tests/design/browser-imports.test.ts). Nothing is imported here.
 */

/** The picker's first option: Farbaek AI chooses the model for each question. */
export const AUTO_MODEL = "auto";

/**
 * The person's own pick where their level lists the models, and Auto where it doesn't. A pick made earlier is kept in the
 * browser, and not used while its list is out of sight.
 */
export function modelToAsk(chosen: string, listsModels: boolean): string {
  return listsModels ? chosen : AUTO_MODEL;
}
