/**
 * The private file store. The Supabase implementation is the only code that
 * reaches the bucket; tests use an in-memory one. Callers decide access
 * before calling it: the store itself checks nothing.
 */
export type DocumentStore = {
  /** Stores new bytes; false if the key already exists or the store failed. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  /** The stored bytes, or null if missing or the store failed. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removes the keys (missing keys are fine); false if the store failed. */
  remove(keys: readonly string[]): Promise<boolean>;
};
