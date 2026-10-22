import { afterEach, describe, expect, it, vi } from "vitest";
import FilmStagePage from "./page";

// The stage itself renders the product's components; only the guard matters here.
vi.mock("@/components/films/stage/film-stage", () => ({ FilmStage: () => null }));

const open = (film: string) => FilmStagePage({ params: Promise.resolve({ film }), searchParams: Promise.resolve({}) });
const notFound = { digest: expect.stringContaining("404") };

describe("the film stage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("doesn't exist unless the server runs with FARBAEK_FILM_STAGE=1", async () => {
    vi.stubEnv("FARBAEK_FILM_STAGE", "");
    await expect(open("build")).rejects.toMatchObject(notFound);
    vi.stubEnv("FARBAEK_FILM_STAGE", "true");
    await expect(open("build")).rejects.toMatchObject(notFound);
  });

  it("only shows films that exist", async () => {
    vi.stubEnv("FARBAEK_FILM_STAGE", "1");
    await expect(open("constructor")).rejects.toMatchObject(notFound);
    await expect(open("build")).resolves.toBeTruthy();
  });
});
