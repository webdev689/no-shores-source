// www.noshores.online's Worker: it sends every address to the same one on the bare domain, so the site, the game's
// saves and the panel's sign-in live at one origin only.

/** The answer for a request to the www host: a lasting redirect to the same path and query on the bare domain. */
export function toBareDomain(request: Request): Response {
  const url = new URL(request.url);
  url.hostname = url.hostname.replace(/^www\./, '');
  return Response.redirect(url.toString(), 301);
}

export default { fetch: toBareDomain };
