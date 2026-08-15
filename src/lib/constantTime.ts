// ABOUTME: Constant-time string comparison for secrets.
// ABOUTME: No env imports, so it is testable on its own — a check nobody can run is a check nobody trusts.

/**
 * Compare two secrets without leaking where they differ.
 *
 * `a === b` exits at the first differing byte. An attacker who can measure the
 * response time can use that to walk a secret out one character at a time, and
 * length is leaked the same way. This always reads to the end of the longer
 * input, and folds the length difference into the same accumulator so a
 * wrong-length secret takes the same path as a wrong-value one.
 *
 * Not a defence against an attacker who can read the secret — it is a defence
 * against one who can only time the answer, which is the position a public
 * webhook endpoint puts them in.
 */
export function constantTimeEquals(provided: string | null | undefined, expected: string | null | undefined): boolean {
  // Nothing configured means nothing is trusted. Failing open here would make an
  // unconfigured deploy silently accept every request that arrived.
  if (!expected || !provided) return false;

  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);

  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
