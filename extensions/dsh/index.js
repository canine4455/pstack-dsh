/**
 * Thin DeepSeek Harness adapter for pstack-dsh.
 *
 * DSH's host-owned filesystem provider stays the discovery implementation. This
 * adapter adds exactly one isolated provider pointing at this package's adapted
 * skills tree: `includeDefaultRoots` is off so no other discovery root is
 * re-scanned, and `watch` is off because the tree is generated and immutable at
 * runtime. It does not copy skill bodies, replace the native skill tool, or add
 * runtime authority.
 *
 * What the generated tree does and does not change is decided by harness/dsh.md
 * and executed by tools/adapt.mjs. The frontmatter *key set* is upstream's, key
 * names untouched — that is what DSH parses. Two things follow:
 *
 *   - A `description` line's *text* may differ from upstream's: the rule table
 *     rewrites Cursor names inside prose, and a description is prose. Keys are
 *     never added, removed or renamed here.
 *   - Keys DSH does not know (`icon`, `color`, `paths`) are still upstream's and
 *     are dropped by DSH itself; the mirror neither rewrites nor removes them.
 *
 * `disable-model-invocation: true` survives verbatim on 57 of the 58 skills, which
 * DSH honours: those 57 are user-invocable (`/name` in the GUI) but not
 * model-invocable. harness/dsh.md carries upstream's read-the-file route for the
 * model, exactly as upstream's own Claude Code mapping does.
 *
 * `inject` is `["skills"]` and nothing else: it is the list the provider package
 * itself declares, which is the only service this adapter touches.
 */

import { fileURLToPath } from "node:url";
import { apply as applyFilesystemProvider } from "@deepseek-ai/dsh-skill-filesystem";

const skillsRoot = fileURLToPath(new URL("../../skills/", import.meta.url));

export const name = "pstack-skills";
export const inject = ["skills"];

export function apply(ctx) {
  applyFilesystemProvider(ctx, {
    providerName: "pstack-skills",
    includeDefaultRoots: false,
    bundledSkillDir: skillsRoot,
    watch: false,
  });
}