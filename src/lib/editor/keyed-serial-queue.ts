/**
 * Serializes async work sharing the same key so at most one call per key is
 * ever in flight at a time — a later call for a key waits for the earlier
 * call's request to fully settle (success OR failure) before its own
 * request is even sent.
 *
 * Motivating bug: the editor's keystroke autosave fires a PATCH on a 500ms
 * idle debounce, fire-and-forget, with no guard against a second debounce
 * cycle firing while the first PATCH is still in flight. That happens any
 * time the network or server is slow enough — a real condition, not a
 * hypothetical one, especially against a serverless/edge backend where
 * per-request latency varies. If the two PATCHes' responses arrive out of
 * order, the LATER-typed content is silently overwritten in the database by
 * the EARLIER-typed content once the slower request finally lands, even
 * though the client already reported both saves as successful. The user's
 * most recent edit is gone from the server with no error anywhere.
 *
 * Serializing sends per key removes the race: a request for key K is never
 * dispatched until the previous request for that same K has already gotten
 * its response, so completion order always matches call order, and the DB
 * never sees two writes to the same row in flight at once.
 *
 * Independent keys are not serialized against each other — saving file A
 * never waits on file B.
 *
 * Accepted tradeoff: if one call for a key hangs indefinitely (a request
 * that never resolves or rejects), later calls for that same key queue
 * behind it. This mirrors ordinary browser/HTTP behavior for a single
 * outstanding request to the same endpoint — nothing before this fix
 * protected against a hung request either — and is judged safer than the
 * alternative (letting out-of-order completions silently corrupt saved
 * content).
 */
export function createKeyedSerialQueue() {
  const tails = new Map<string, Promise<void>>();

  return function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const result = prev.then(fn, fn);
    // A tail that never rejects, so a later call's `tails.get(key)` is
    // always safe to chain onto with a plain `.then` regardless of whether
    // this call succeeded or failed.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    // Once this call's link is no longer the most recent for `key`, drop the
    // entry so the map doesn't grow forever for files nobody touches again.
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
