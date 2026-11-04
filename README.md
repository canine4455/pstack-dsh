# pstack-dsh

pstack's 58 skills, adapted to load in DeepSeek Harness (DSH) as one bundle, with no build step.

## Install

In a DSH profile:

```sh
cd ~/.dsh/profiles/web && pnpm add "github:canine4455/pstack-dsh"
```

Then add `"pstack-dsh"` to the `dsh.profile.bundles` array in that same `package.json` and restart DSH. `pnpm add` alone only puts the files in `node_modules`; it does not register the package as a bundle, so DSH will not load the skills until the bundle entry exists.

## What you get

58 pstack skills served by one isolated provider (`pstack-skills`) that reads this
package's generated `skills/` tree. The host's own provider, skill tool, and
discovery roots are untouched.

Upstream sets `disable-model-invocation: true` on 57 of the 58, and DSH honours that key, so:

| Invocation route | Skills | In the model-facing catalog |
| --- | --- | --- |
| User invokes `/name` | 57 | No |
| Model-invocable | 1 (`setup-pstack`) | Yes |

So 57 skills are user-invocable from the `/` menu but not model-invocable; `setup-pstack` is the only one the model can invoke on its own. For the rest, the agent reads `skills/<name>/SKILL.md` directly, which [`harness/dsh.md`](harness/dsh.md) instructs it to do.

## Usage model in DSH

Three facts decide how these skills actually get used, and none of them is "the model calls all 58":

1. **One skill is model-invocable: `setup-pstack`.** The other 57 carry `disable-model-invocation: true`, so DSH filters them out of the model-facing `<available_skills>` catalog and the `skill` tool refuses them by name. "Model, use the how skill" cannot work — `how` is never offered as callable.
2. **The other 57 are user-triggered.** They sit in the composer's `/` menu (badged user-only). Typing `/how`, `/poteto-mode`, `/swarm` loads that skill's body into the session. That is the entry point DSH provides, and it is the same route upstream's own Claude Code adapter prescribes (`vendor/pstack/docs/harness/claude-code.md`: the `Skill` tool refuses most pstack skills there too).
3. **Once a body is in play, sibling files resolve from its base directory.** The `skill` tool reports where the loaded `SKILL.md` lives — e.g. `<profile>/node_modules/pstack-dsh/skills/poteto-mode` — and every bundled skill addresses its neighbours relative to that file (`../<name>/SKILL.md`, `references/*` beside it). So a `poteto-mode` run can pull its principles and hand a delegate a working path without guessing. Skills whose body still names a Cursor construct also get a pointer line under their H1 pointing at `harness/dsh.md` the same way — 20 of the 58 today, because the pointer is gated on `pointerWhen` matching, not applied to every skill.

A consequence worth stating plainly: this package does **not** make 57 skills available for autonomous model selection. That is upstream's choice, honoured here, not a mirror defect. Making them autonomously reachable would be a host-side decision (a session-level router), not something a skill pack can declare for itself.

Evidence that this route works end to end — a real `/how` and a real `/poteto-mode` load inside DeepSeek Harness, with the base directories and the rewritten body quoted — is in [`EVIDENCE.md`](EVIDENCE.md) §A8.

## Lineage and license

- Derived from `cursor/plugins/pstack` (author Poteto, MIT). See [`NOTICE`](NOTICE); [`LICENSE`](LICENSE) keeps the upstream copyright line.
- `vendor/pstack/` is an unmodified upstream snapshot.
- `skills/` and `agents/` are generated from it by `tools/adapt.mjs`, which applies only the rewrites listed in `harness/dsh.md`.
- The DSH adaptation layer is an independent, unofficial contribution — not affiliated with or endorsed by the upstream author. Where upstream behaviour and this mirror disagree, upstream is right.

## How the mirror stays in sync

The daily GitHub Actions workflow `.github/workflows/sync-upstream.yml` sparse-clones `cursor/plugins` (the `pstack/` directory only), regenerates the mirror, runs the adaptation guard, and — **only when upstream actually changed** — appends a row to [`SYNC-LOG.md`](SYNC-LOG.md) and commits. A run that finds no upstream change writes no row and makes no commit; "no change" is a fact about a run, so it is recorded in the Actions run and its job summary, not in the log.

## Verification

Two workflows, deliberately split by trigger and by power:

| workflow | trigger | network | permissions | what it proves |
| --- | --- | --- | --- | --- |
| [`check.yml`](.github/workflows/check.yml) | every push to `main`, every pull request | none | `contents: read` | the committed tree is self-consistent: `tools/adapt.mjs --check` finds no drift, the adaptation guard is green, `tools/verify-install.mjs --strict` passes, no skill name collides with a host root |
| [`sync-upstream.yml`](.github/workflows/sync-upstream.yml) | daily schedule + manual dispatch | clones `cursor/plugins` | `contents: write` | upstream is mirrored: regenerate, guard, append a SYNC-LOG row only on a real change, commit only then |

`check.yml` skips pushes authored by `github-actions[bot]` — that is the scheduled sync committing, and `sync-upstream.yml` already ran the same offline checks on that exact tree in the same run. It cannot loop: it never pushes.

## Verify an install

```sh
node tools/verify-install.mjs --strict
```

Offline, and no DSH process needed. It prints which package root it tested, then one line per check. `--strict` turns every skip into a failure except one whitelisted case: the patch target's import of `@deepseek-ai/dsh-skill-filesystem`, an *optional* peer that only exists inside a DSH profile. Without `--strict`, a dead copy of this package can print "1 skipped, 0 failed" and look healthy; with it, a copy that cannot load is red.

```sh
node tools/check-name-conflicts.mjs            # or: --roots <dir>[,<dir>…]
```

Compares the 58 names against your own skill roots (`~/.dsh/skills`, `~/.dsh/plugins/*/skills`, `<profile>/node_modules/aegis/skills`). A root that does not exist is SKIPped with a printed reason — on a CI runner that is every root, which is why the output says so instead of claiming a clean scan.

[`EVIDENCE.md`](EVIDENCE.md) records the acceptance run for this mirror: the commands, their real output, and every place the result differed from the plan.