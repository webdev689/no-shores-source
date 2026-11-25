/** The keys an address is counted by, in the accounts and in the rooms: each by the block one holder is given. */

/** The address a request's limits are kept by: an IPv4 address whole, an IPv6 address by its /64, since one network
 *  holds a whole /64. */
export function addressKey(address: string): string {
  return ipv6Prefix(address, 4);
}

/** The address new guests are counted by: an IPv6 address by its /48, the block one tunnel or one customer is given,
 *  so many networks of one holder make ten guests an hour, not ten each
 *  ([[The Audit's Leftovers Are Fixed as Claude Suggested]]). */
export function guestKey(address: string): string {
  return ipv6Prefix(address, 3);
}

/** An IPv4 address whole; an IPv6 address by its first `groups` groups of 16 bits. */
function ipv6Prefix(address: string, groups: number): string {
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const whole = address.includes('::')
    ? [...front, ...Array(8 - front.length - back.length).fill('0'), ...back]
    : front;
  return `${whole
    .slice(0, groups)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/${groups * 16}`;
}

/** A session token's SHA-256, in hex: what the sea knows a ship played unkept by, never the token itself. */
export async function sessionHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
