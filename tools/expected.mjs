/**
 * The one number the generator and every verifier must agree on.
 *
 * Upstream ships 58 skills today. When that changes, the guards fail loudly and
 * name this constant — bumping it is a human decision, because a mirror that
 * silently shrinks (or grows) when upstream renames or deletes a directory is
 * exactly the failure these checks exist to catch. Do not "fix" a red guard by
 * editing this file until you have looked at what upstream actually changed.
 */
export const EXPECTED_SKILLS = 58;

/** Message used by every check that compares a found count against the constant. */
export function skillCountHint(found) {
  return (
    `expected ${EXPECTED_SKILLS} skill directories, found ${found} — upstream's skill set changed. ` +
    "Confirm the change by hand (git log in cursor/plugins, then vendor/pstack/skills), then update " +
    "EXPECTED_SKILLS in tools/expected.mjs."
  );
}