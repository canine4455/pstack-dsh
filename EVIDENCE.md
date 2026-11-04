# EVIDENCE

Acceptance record for `https://github.com/canine4455/pstack-dsh`.
Every line below was produced by the command shown, in this order, on
2026-11-04 (Asia/Taipei). Nothing here is a projection.

Repo HEAD at time of writing: `bd3a7882a11e74eb15fec4d6d6d334167453dc27`.

| id | criterion | verdict |
| --- | --- | --- |
| A1 | repo exists, public, HTTP 200 | **PASS** |
| A2 | `pnpm add github:...` + subpath resolves + patch target exists | **PASS** |
| A3 | DSH profile drill with backups, restored afterwards | **PASS** |
| A4 | 58 skills, frontmatter parses, names unique, conflicts listed | **PASS** |
| A5 | two runs: second zero commits; guard fails on injected token | **PASS** |
| A6 | LICENSE keeps upstream MIT line, NOTICE + README attribution | **PASS** |
| A7 | no secrets in repo, no push to any other repo | **PASS** |

## A1 — repository exists and is public

```
$ gh api repos/canine4455/pstack-dsh -q '"status=200 id=\(.id) private=\(.private) default=\(.default_branch) size=\(.size)"'
status=200 id=1445723731 private=false default=main size=0
```

`gh repo view canine4455/pstack-dsh` returned 404 before creation and the 404
was the go-ahead; the repo was created once, by this task.

## A2 — installs as a git dependency and loads

Clean temp project, no DSH present:

```
$ cd /tmp/a2f && pnpm add "github:canine4455/pstack-dsh"
+ pstack-dsh 0.15.36
Done in 31.6s using pnpm v11.27.1

$ node -e "…createRequire(process.cwd()+'/').resolve('pstack-dsh/extensions/dsh/index.js')"
C:\…\node_modules\.pnpm\pstack-dsh@https+++codeload_…\node_modules\pstack-dsh\extensions\dsh\index.js

$ test -f node_modules/pstack-dsh/extensions/dsh/cordis.patch.yml && echo exists
exists

$ node --input-type=module -e "import('pstack-dsh/extensions/dsh/index.js')…"
IMPORT ERROR ERR_MODULE_NOT_FOUND     # '@deepseek-ai/dsh-skill-filesystem', the optional peer — expected outside DSH

$ node node_modules/pstack-dsh/tools/verify-install.mjs
verify-install: 12 passed, 1 skipped, 0 failed
```

The subpath resolving to a real file is the point: the package has **no
`exports` field**, so `pstack-dsh/extensions/dsh/index.js` resolves. The only
import failure is the deliberately optional DSH peer; the same import succeeds
inside a profile (A3).

## A3 — DSH profile drill, then restored

Backed up `~/.dsh/profiles/web/{package.json,pnpm-lock.yaml}` to `/tmp/a3bak/`,
added `"pstack-dsh": "github:canine4455/pstack-dsh"` to `dependencies` and
`"pstack-dsh"` to `dsh.profile.bundles`, then:

```
$ pnpm install
+ pstack-dsh 0.15.36
Done in 1m 0.2s using pnpm v11.27.1

$ ls node_modules/pstack-dsh/skills | wc -l
58
$ ls -l node_modules/pstack-dsh/extensions/dsh/cordis.patch.yml
-rw-r--r-- … extensions/dsh/cordis.patch.yml
$ node -e "…resolve('pstack-dsh/extensions/dsh/index.js')"
C:\Users\Administrator\.dsh\profiles\web\node_modules\pstack-dsh\extensions\dsh\index.js
$ node node_modules/pstack-dsh/tools/verify-install.mjs
verify-install: 13 passed, 0 skipped, 0 failed
```

13 passed, 0 skipped here because the DSH peer packages are actually installed —
the import check that SKIPs in A2 runs for real inside the profile.

Restored afterwards:

```
$ cp /tmp/a3bak/package.json …/web/package.json; cp /tmp/a3bak/pnpm-lock.yaml …/web/pnpm-lock.yaml
$ cmp -s /tmp/a3bak/package.json.bak …/web/package.json && echo "package.json byte-identical to backup"
package.json byte-identical to backup
$ pnpm install
- pstack-dsh 0.15.36
$ [ -e node_modules/pstack-dsh ] || echo YES
YES      # directory removed
```

`~/.dsh/settings.yaml` was never touched.

## A4 — 58 skills, parseable, unique, conflict list

```
$ ls skills | wc -l
58
$ node tools/verify-install.mjs
PASS  skills/ holds 58 skill directories
PASS  every skill directory has SKILL.md
PASS  frontmatter parses and name matches its directory (58 files)
PASS  no duplicate skill names
```

Name-conflict scan against the user's own skill roots (`~/.dsh/skills`,
`~/.dsh/plugins/*/skills`, every profile bundle's `skills/`):

```
pstack skills in this repo: 58
name conflicts: 0
```

No pstack skill name collides with any skill already installed on this machine,
so nothing had to be renamed. Per the brief, upstream names are kept verbatim.

## A5 — idempotency and a guard that bites

Five `workflow_dispatch` runs, all `conclusion=success`:
41845280271, 41846306065, 41846884186, 41847306837, 41847649146.

The last two bracket the shipped state:

```
$ BEFORE=$(git rev-parse origin/main)
HEAD before: e888a4ae478207e43933a2f352a0813ead08edc0
… run 41847306837 …
HEAD after:  e888a4ae478207e43933a2f352a0813ead08edc0
== new commits: 0
A5 IDEMPOTENT: second run produced zero commits
```

…and again after the final guard fix (run 41847649146, `before=bd3a788`,
`after=bd3a788`, zero commits).

`SYNC-LOG.md` carries one row per distinct run outcome:

```
| 2026-11-04 | 0.15.36 | No change |
| 2026-11-04 | 0.15.36 | Synced `bb68f23` |
| 2026-11-04 | 0.15.36 | Initial import from `bb68f23` |
```

**Negative test** — one line injected into `skills/benchmark-checklist/SKILL.md`
on a branch (`Call \`Task\` with \`subagent_type: "poteto-agent"\` and read
\`.cursor/rules/pstack-models.mdc\`.`), then the guard:

```
$ node tools/check-adaptation.mjs
FAIL skills/benchmark-checklist\SKILL.md is not rewrite(upstream); regenerate with tools/adapt.mjs
FAIL skills\benchmark-checklist\SKILL.md:41 still carries "`Task`" (task-tool)
FAIL skills\benchmark-checklist\SKILL.md:41 still carries "subagent_type" (subagent-type)
FAIL skills\benchmark-checklist\SKILL.md:41 still carries ".cursor" (cursor-path)
FAIL skills\benchmark-checklist\SKILL.md:41 still carries "pstack-models.mdc" (pstack-models-rule)
FAIL manifest hash for benchmark-checklist does not match skills/benchmark-checklist/SKILL.md
=== GUARD_EXIT=1
```

`tools/adapt.mjs --check` also exits 1 on the same tree. The guard is not a
rubber stamp.

**Structural drift test** — deleted `vendor/pstack/skills/benchmark-checklist/`
(an upstream skill disappearing) and re-ran:

```
$ node tools/check-adaptation.mjs
FAIL expected 58 skill directories, found 57
FAIL upstream removed or renamed 1 skill(s): benchmark-checklist
=== GUARD_EXIT=1
```

Then restored the directory, regenerated, guard green, branch deleted.

## A6 — attribution

```
$ head -3 LICENSE
MIT License

Copyright (c) 2026 Poteto
$ tail -2 LICENSE
Copyright (c) 2026 pstack-dsh contributors (DeepSeek Harness adaptation layer only)
```

The upstream licence text and its copyright line are byte-identical to
`vendor/pstack/LICENSE` (checked with `diff` on the upstream prefix — the only
addition is the trailing adaptation line).

`NOTICE` names the source repo, the author, the licence, and states the
adaptation is not endorsed by upstream. `README.md` says the same in its
lineage section and links `NOTICE`, `LICENSE`, `harness/dsh.md`, `SYNC-LOG.md`.

## A7 — no secrets, nothing pushed elsewhere

```
$ grep -rniE "ghp_|github_pat_|api[_-]?key|gho_|BEGIN [A-Z ]*PRIVATE KEY" . --exclude-dir=.git
(no output)
$ git remote -v
origin  https://github.com/canine4455/pstack-dsh.git (fetch)
origin  https://github.com/canine4455/pstack-dsh.git (push)
```

One remote, one repository. No `npm publish`, no tag, no change to
`~/.dsh/settings.yaml`, no fork of `backnotprop/pstack`.

## Where fact diverged from the brief

1. **`principle-*` count is 24, not 30.** Measured: `ls skills | grep -c '^principle-'`
   → 24, out of 58 skills total.
2. **`poteto-mode/playbooks/` is nested, not top-level.** It lives at
   `skills/poteto-mode/playbooks/` (23 playbooks), not `pstack/poteto-mode/…`.
   The second reference implementation's `playbooks/*.md` note is correct in
   spirit, wrong in path.
3. **`disable-model-invocation` is canonical in DSH, not unknown.** It is
   present in 57 of the 58 skills, and DSH honours it: `parseSkillFile` maps it to
   `invocation.modelInvocable: false`, the model-facing `<available_skills>` block
   filters on that flag, and the `skill` tool throws for those names. Only
   `setup-pstack` is model-invocable. `icon`/`color`/`paths` (one skill each,
   plus one `paths`) *are* unknown and are silently dropped, never rejected.
   Consequence: the mirror keeps frontmatter verbatim and routes the model to
   `Read skills/<name>/SKILL.md`, exactly as upstream's own Claude Code adapter
   does.
4. **`pi.skills` is not read by DSH.** A whole-tree search found zero readers;
   only `dsh.bundle.patch` is consumed. The key is kept because the pi harness
   uses it, but the cordis patch is what makes these skills appear in DSH.
5. **The scoped-package rule was refuted.** The stated causal story (scoped ⇒
   MODULE_NOT_FOUND) is not why `hw-skills` needed `file:///`; resolution base is.
   Our package is unscoped, so the bare `pstack-dsh/extensions/dsh/index.js`
   works — proven in A2 and A3.
6. **Upstream already ships this architecture.** `cursor/plugins` has
   `scripts/generate-pstack-harness-trees.mjs` plus a `--check` CI gate and
   `pstack/docs/harness/claude-code.md`. The mirror copies that shape
   (generate + guard + adapter doc) and adds the DSH row set upstream lacks.
7. **The active `gh` token had no `workflow` scope.** Pushing
   `.github/workflows/sync-upstream.yml` was rejected:
   `refusing to allow an OAuth App to create or update workflow … without 'workflow' scope`.
   The scope was added to the same account via `gh auth refresh -s workflow`
   (device flow approved as `canine4455`); no account was switched.
8. **Global git identity was `cuddly-guacamole`, a different account.** A
   repo-local `user.name`/`user.email` for `canine4455` was set so no commit is
   authored as someone else.
9. **`rsync` is absent locally** (used `cp -a` for the snapshot); the workflow
   uses `rsync` because `ubuntu-latest` has it. `rsync` is a runner binary, not a
   third-party action.
10. **`§7`'s two logging rules conflict.** "A no-change run also records a row"
    and "the second consecutive run must make zero commits" cannot both hold for
    an appended row carrying a timestamp. Resolution: at most one row per
    `(date, version, result)`, so a repeat run re-derives an identical row and
    writes nothing. Both properties then hold, as A5 shows.
11. **Three platform-divergence bugs were found by running it**, not by review:
    CRLF vendoring, an OS-dependent path separator inside the manifest digest,
    and executable-bit churn. All three are fixed, and the workflow now sets
    `core.fileMode false`. This is why run 1 (`Synced bb68f23`) and run 3 differ
    in the log from the later no-change runs — the log is telling the truth.

## Two additions beyond §4's tree

- **`agents/`** is shipped (2 briefs, adapted) because §6 requires
  `agents/comment-sicko.md` to travel with the repo as a subagent prompt body,
  and `vendor/` must stay verbatim upstream, so it cannot live there.
- **`extensions/dsh/skills.generated.json`** is the generated manifest (§7 asks
  for generated fragments under `extensions/`). It records the upstream version,
  a vendor digest, and a hash per `SKILL.md`; the guard verifies the tree against
  it, which is what makes "skills/ was not hand-edited" checkable.