/** An errand an outpost's room holds for its host, as `room-wasm`'s outpost door writes it. */
export interface Errand {
  readonly id: number;
  /** The accounts' id for it, which the character carries until it is answered. */
  readonly rid: string;
  readonly player: number;
  readonly account: string;
  readonly kind: 'deposit' | 'deliver' | 'take' | 'horn' | 'changed';
  readonly amount?: number;
  readonly structure?: number;
  readonly stuff?: 'timber' | 'canvas' | 'iron' | 'heartwood' | 'island';
}
