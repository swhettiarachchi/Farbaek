/**
 * The stage and its window (ADR 0218, ADR 0230). On a wide screen every signed-in page is a rounded window on a pale
 * stage, with the spectrum's light glowing from behind the window's edges. This is the one definition of that, so Chat,
 * the studios, Build's workspace and the app's own pages can't drift apart. On phones and small tablets there is no
 * stage: the page is edge to edge.
 *
 * How to use it: the outer element takes `relative`, its own height, and STAGE; StageLight goes first inside it; the
 * element that holds the page takes `relative`, its own layout, and STAGE_WINDOW.
 *
 * The light's styles are in src/styles/chat-theme.css, which the page's route imports. It is still. Inside an element
 * with the class `chat-root` it travels slowly round while something there is busy (`aria-busy`), never under reduced
 * motion.
 */

/** The stage: the pale ground and the gap round the window. */
export const STAGE = "lg:bg-canvas-2 lg:p-3 xl:p-4 2xl:p-5";

/** The window: the page's own ground, with its corner, hairline and soft shadow. */
export const STAGE_WINDOW = "bg-canvas lg:rounded-lg lg:border lg:border-line lg:shadow-e2";

/** The light behind the window. Decoration only: nothing reads it, and it takes no clicks. */
export function StageLight() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      <div className="chat-halo" />
      <div className="chat-halo-fade absolute inset-0" />
    </div>
  );
}
