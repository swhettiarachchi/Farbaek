/**
 * How Farbaek Chat serves a stored file (stage 199): the bytes with the type the server checked when it was saved, never sniffed,
 * under a policy that sandboxes the response so a file can never run as a page on Farbaek. Pictures show inline; anything else
 * downloads.
 */
export function chatFileResponse(file: { name: string; mime: string; kind: string; bytes: Uint8Array }, options: { download: boolean; cache: "private" | "none" }): Response {
  const download = options.download || file.kind !== "image";
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.bytes.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "referrer-policy": "no-referrer",
      // A saved file never changes, but it's private: kept in this browser only, or not at all for a shared link.
      "cache-control": options.cache === "private" ? "private, max-age=86400, immutable" : "no-store",
    },
  });
}
