// The rooms' answer to `/health`: that their Worker answers, for the desktop app's launcher to say whether the game's
// servers are up before the player presses Play. Any page may ask, and the answer is never kept.

/** The answer to `request` where it asks for the rooms' health; null for any other address. */
export function healthAnswer(request: Request): Response | null {
  if (new URL(request.url).pathname !== '/health') return null;
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
