/** The outcome of an action that can be rejected: rejections are values, not exceptions. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
