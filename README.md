# pstack-dsh

pstack's 58 skills, adapted to load in DeepSeek Harness (DSH) as one bundle, with no build step.

## Install

In a DSH profile:

```sh
cd ~/.dsh/profiles/web && pnpm add "github:canine4455/pstack-dsh"
```

Then add `"pstack-dsh"` to the `dsh.profile.bundles` array in that same `package.json` and restart DSH. `pnpm add` alone only puts the files in `node_modules`; it does not register the package as a bundle, so DSH will not load the skills until the bundle entry exists.

## What you get

58 pstack skills in the DSH skill catalog, served by one isolated provider (`pstack-skills`) that reads this package's generated `skills/` tree. The host's own provider, skill tool, and discovery roots are untouched.

Upstream sets `disable-model-invocation: true` on 57 of the 58, and DSH honours that key, so:

| Invocation route | Skills | In the model-facing catalog |
| --- | --- | --- |
| User invokes `/name` | 57 | No |
| Model-invocable | 1 (`setup-pstack`) | Yes |

So 57 skills are user-invocable from the `/` menu but not model-invocable; `setup-pstack` is the only one the model can invoke on its own. For the rest, the agent reads `skills/<name>/SKILL.md` directly, which [`harness/dsh.md`](harness/dsh.md) instructs it to do.

## Lineage and license

- Derived from `cursor/plugins/pstack` (author Poteto, MIT). See [`NOTICE`](NOTICE); [`LICENSE`](LICENSE) keeps the upstream copyright line.
- `vendor/pstack/` is an unmodified upstream snapshot.
- `skills/` and `agents/` are generated from it by `tools/adapt.mjs`, which applies only the rewrites listed in `harness/dsh.md`.
- The DSH adaptation layer is an independent, unofficial contribution — not affiliated with or endorsed by the upstream author. Where upstream behaviour and this mirror disagree, upstream is right.

## How the mirror stays in sync

The daily GitHub Actions workflow `.github/workflows/sync-upstream.yml` sparse-clones `cursor/plugins` (the `pstack/` directory only), regenerates the mirror, runs the adaptation guard, and commits only when something changed, recording a row in [`SYNC-LOG.md`](SYNC-LOG.md). A run that finds no upstream change produces no commit.

## Verify an install

```sh
node tools/verify-install.mjs
```

Offline, and no DSH process needed. It prints which package root it tested, then one line per check. Outside a DSH profile the `@deepseek-ai/*` peer packages are absent, so the patch-target import check reports SKIP instead of FAIL; every other check is real.

[`EVIDENCE.md`](EVIDENCE.md) records the acceptance run for this mirror: the commands, their real output, and every place the result differed from the plan.