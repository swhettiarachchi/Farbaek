"use client";

/**
 * Keeps Farbaek Chat inside the part of the screen the keyboard leaves free (stage 199). Android with resizes-content shrinks the
 * page itself; iPhone and iPad keep the page tall and only shrink the visual viewport, so the chat's height follows the visual
 * viewport there (--chat-vh) and the page is held at the top, so the header and the newest message stay on screen while typing.
 */
import { useEffect, type RefObject } from "react";

export function useKeyboardViewport(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = root.current;
    if (!vv || !el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const keyboard = window.innerHeight - vv.height > 80;
        if (keyboard) {
          el.style.setProperty("--chat-vh", `${Math.round(vv.height)}px`);
          el.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
        } else {
          el.style.removeProperty("--chat-vh");
          el.style.transform = "";
        }
      });
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      el.style.removeProperty("--chat-vh");
      el.style.transform = "";
    };
  }, [root]);
}
