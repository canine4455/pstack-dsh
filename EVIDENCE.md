# EVIDENCE

Acceptance record for `https://github.com/canine4455/pstack-dsh`.
Every line below was produced by the command shown, in this order, on
2026-11-04 (Asia/Taipei). Nothing here is a projection.

Repo HEAD at last verification: this file's own commit (see `git log -1 --format=%h`
in §A9). The last *generated-tree* commit is still `bd3a788`; every commit after it
is documentation, a tool fix, or a workflow fix.

Where a number below belongs to the pre-fix build it says so, in place:

- §A2 and §A3 keep the counts the tools printed on 2026-11-04 at HEAD `897cd45`
  (`verify-install: 12 passed, 1 skipped` outside a profile; `13 passed, 0 skipped`
  inside one). Those runs are history; the tool has changed since.
- §A5, §A7, §A8 and §A9 were re-measured on the tree that contains the current
  tools — the outputs quoted there are the current ones, including the numbers
  that moved (`14 passed, 1 skipped` in a source checkout, guard now also proving
  hygiene, and so on).

| id | criterion | verdict |
| --- | --- | --- |
| A1 | repo exists, public, HTTP 200 | **PASS** |
| A2 | `pnpm add github:...` + subpath resolves + patch target exists | **PASS** |
| A3 | DSH profile drill with backups, restored afterwards | **PASS** |
| A4 | 58 skills, frontmatter parses, names unique, conflicts listed | **PASS** |
| A5 | two runs: second zero commits; guard fails on injected token | **PASS** |
| A6 | LICENSE keeps upstream MIT line, NOTICE + README attribution | **PASS** |
| A7 | no secrets in repo, no push to any other repo | **PASS** |
| A8 | runtime load in DSH: `/how` and `/poteto-mode` both load from the installed copy | **PASS** |

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

_(These counts are the pre-fix verifier: it has since gained the name-conflict
check and `--strict`, so the same install now reports `14 passed, 1 skipped` in a
source checkout and `14 passed, 0 skipped` against an installed copy. §A9 is the
post-push re-run with the current tools.)_

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
%USERPROFILE%\.dsh\profiles\<profile>\node_modules\pstack-dsh\extensions\dsh\index.js
$ node node_modules/pstack-dsh/tools/verify-install.mjs
verify-install: 13 passed, 0 skipped, 0 failed
```

13 passed, 0 skipped there because the DSH peer packages were resolvable from the
host's own DSH installation — the import check that SKIPs in A2 runs for real.
(Path shown with `%USERPROFILE%` and `<profile>` placeholders: this file is public,
and an operator's real account name and profile layout do not belong in it.)

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
`~/.dsh/plugins/*/skills`, `<profile>/node_modules/aegis/skills`). This is a tool,
not a one-off shell loop, so the claim below is reproducible:

```
$ node tools/check-name-conflicts.mjs
package under test: <repo>
pstack skills in this package: 58
roots scanned: 7
  SCANNED %USERPROFILE%\.dsh\skills (10 skills)
  SCANNED %USERPROFILE%\.dsh\plugins\doubao-skills\skills (28 skills)
  SCANNED %USERPROFILE%\.dsh\plugins\dsh-blender-plugin\skills (1 skills)
  SCANNED %USERPROFILE%\.dsh\plugins\dsh-orchestrator-preset-bundle\skills (4 skills)
  SCANNED %USERPROFILE%\.dsh\plugins\hw-skills\skills (12 skills)
  SCANNED %USERPROFILE%\.dsh\profiles\desktop\node_modules\aegis\skills (23 skills)
  SCANNED %USERPROFILE%\.dsh\profiles\web\node_modules\aegis\skills (23 skills)
  SKIP …: directory does not exist        # 9 roots that this machine does not have
host skills seen: 78
name conflicts: 0
$ echo $?
0
```

No pstack skill name collides with any of the 78 skills already installed on this
machine, so nothing had to be renamed. Per the brief, upstream names are kept
verbatim. `--roots <dir>[,<dir>…]` overrides the discovery; on a runner with no
`~/.dsh` every root is SKIPped **with a printed reason**, which is the point — a
scan that proves nothing must say so instead of printing a clean zero.

## A5 — idempotency and a guard that bites

Six `workflow_dispatch` runs, all `conclusion=success`:
41845280271, 41846306065, 41846884186, 41847306837, 41847649146, 41848213335.

The two that bracket the pre-fix shipped state:

```
$ BEFORE=$(git rev-parse origin/main)
HEAD before: e888a4ae478207e43933a2f352a0813ead08edc0
… run 41847306837 …
HEAD after:  e888a4ae478207e43933a2f352a0813ead08edc0
== new commits: 0
A5 IDEMPOTENT: second run produced zero commits
```

…and again after the final guard fix (run 41847649146, `before=bd3a788`,
`after=bd3a788`, zero commits). Run 41848213335 repeated it on `897cd45` and said
`::notice::no upstream change; nothing to commit`.

**The sync rule, corrected.** A run that finds no upstream change now writes **no
`SYNC-LOG.md` row and no commit**. "No change" is a fact about a run, so it belongs
in the Actions run record and the job summary, not in the log. Rows are appended
only for a real change — an initial import, or a `Synced` row — and the row dedupe
stays as the backstop for re-running a change that was already recorded. The one
`No change` row still in `SYNC-LOG.md` predates the rule and is kept as history.

`SYNC-LOG.md` therefore reads:

```
| 2026-11-04 | 0.15.36 | No change |            # history: written by run 3 under the old rule
| 2026-11-04 | 0.15.36 | Synced `bb68f23` |
| 2026-11-04 | 0.15.36 | Initial import from `bb68f23` |
```

Two of those six runs did produce commits while claiming identical work
(`d3a6de3`, `a05c301`, same message `sync: pstack 0.15.36 from bb68f23…`). The
cause was executable-bit churn between the Linux runner (`100755`) and commits made
from a Windows checkout (`100644`); `33e1a3a` added `git config core.fileMode false`
to the workflow and the last three runs produced zero commits each. It is recorded
here because it happened, not because it still does.

**Negative test (re-measured with the current guard).** One line appended to a
copy's `skills/how/SKILL.md`:

```
$ printf '\nInjected: spawn a Task tool call and read .cursor/rules/pstack-models.mdc.\n' >> skills/how/SKILL.md
$ node tools/check-adaptation.mjs
FAIL skills/how/SKILL.md is not rewrite(upstream); regenerate with tools/adapt.mjs
FAIL skills/how/SKILL.md:40 still carries "Task tool" (task-tool)
FAIL skills/how/SKILL.md:40 still carries ".cursor" (cursor-path)
FAIL skills/how/SKILL.md:40 still carries "pstack-models.mdc" (pstack-models-rule)
FAIL manifest hash for how does not match skills/how/SKILL.md
$ echo $?
1
$ node tools/adapt.mjs --check
skills/how/SKILL.md
pstack-dsh is out of date. Run `node tools/adapt.mjs` and commit the result.
$ echo $?
1
```

The guard names the file, the line and the rule, and both entry points exit
non-zero. Not a rubber stamp.

**Structural drift test (re-measured).** Deleted `vendor/pstack/skills/benchmark-checklist/`
in a copy (an upstream skill disappearing) and re-ran:

```
$ node tools/adapt.mjs
FAIL expected 58 skill directories, found 57 — upstream's skill set changed. Confirm the
change by hand (git log in cursor/plugins, then vendor/pstack/skills), then update
EXPECTED_SKILLS in tools/expected.mjs.
nothing was written; fix the above and re-run
$ echo $?
1
$ ls skills | grep -c benchmark-checklist
1                                        # the shipped tree was NOT half-deleted first
$ node tools/check-adaptation.mjs
FAIL skills/benchmark-checklist/SKILL.md is shipped but does not exist upstream
FAIL skills/benchmark-checklist has no upstream counterpart
$ echo $?
1
```

**A generator with no sources must fail before it writes.** Deleted
`vendor/pstack/skills/` entirely in a copy:

```
$ node tools/adapt.mjs
FAIL missing upstream source vendor/pstack/skills/ — upstream layout changed
nothing was written; fix the above and re-run
$ echo $?
1
$ find skills -name SKILL.md | wc -l
58                                       # unchanged; the previous version rm -rf'd first
```

**Attribution, re-measured on the generated tree.** The generator and the guard now
import the same rule engine (`tools/rules.mjs`), so the audit is the same code that
wrote the tree — not a second implementation that could agree by luck.

```
$ diff -rq vendor/pstack/skills skills | wc -l
36
$ diff -r vendor/pstack/skills skills | grep -cE '^(<|>)'
316                                      # 138 removed, 178 added
$ diff -rq vendor/pstack/agents agents | wc -l
2
$ diff -r vendor/pstack/agents agents | grep -cE '^(<|>)'
6
$ node tools/check-adaptation.mjs | tail -2
adaptation guard passed: 58 skills, 66 rules, 0 forbidden constructs, 0 real local paths, 0 credential shapes.
adapter: harness/dsh.md
```

36 of 535 files differ (2 of 2 under `agents/`), and every one of those 316 + 6
changed lines is attributed to a rule in `harness/dsh.md` or to the pointer line:
zero unattributable lines. Regeneration is a byte-level no-op — `git status` before
and after `node tools/adapt.mjs` is identical.

**Rule coverage note.** The generator reports how many rule ids actually fire:
`58 skills, 537 files, 122 rewrites across 57 rules, 20 pointer lines under
lineEndings "crlf-to-lf", upstream 0.15.36.` together with `note: 9 rule(s) matched
nothing upstream`. Those nine are cross-version safety nets, not dead weight the
guard relies on: `forbid` still catches any occurrence they would have rewritten.

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

## A7 — no secrets, no real local paths, nothing pushed elsewhere

The first version of this check could not reproduce its own "(no output)": the
command line spelled the token prefixes out (`gh` followed by `p_`), so re-running
the same grep found the line that documented it. Two things changed, and both are
now enforced rather than remembered:

- the prefixes are written as bracket expressions (`gh[p]_`, `github[_]pat_`), so the
  pattern cannot match its own source line;
- the scan moved into `tools/check-adaptation.mjs` (proof 7), next to a new assertion
  that the repo carries no real local absolute path outside `vendor/`.

```
$ node tools/check-adaptation.mjs
adaptation guard passed: 58 skills, 66 rules, 0 forbidden constructs, 0 real local paths, 0 credential shapes.
$ grep -rniE 'gh[p]_|gh[o]_|github[_]pat_|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY' . --exclude-dir=.git
(no output)
$ git remote -v
origin  https://github.com/canine4455/pstack-dsh.git (fetch)
origin  https://github.com/canine4455/pstack-dsh.git (push)
```

The path assertion accepts placeholders (`%USERPROFILE%`, `<profile>`, `<name>`) and
rejects a real account segment, which is why §A3 shows `%USERPROFILE%\.dsh\profiles\<profile>\…`
instead of the account name that was there before.

One remote, one repository. No `npm publish`, no tag, no change to
`~/.dsh/settings.yaml`, no fork of `backnotprop/pstack`.

## A8 — runtime load in DSH

This is the part no static check can prove: whether DSH actually loads these skills
out of the installed copy. Two recordings, made by the operator in a real DeepSeek
Harness desktop session, and one independent re-check of the same files by this run.
The quotes keep the operator's wording verbatim; the only edit is the account name in
each base directory, written `<name>` for the same reason §A3 uses `%USERPROFILE%` —
this file is public.

### a. What the model sees

In the same session, the model-facing skill catalog carries exactly one pstack skill,
`setup-pstack`. The other 57 carry `disable-model-invocation: true`, which DSH
honours by filtering them out of `<available_skills>` and refusing them by name in
the `skill` tool. In DSH's semantics that key is not a hint — those skills' only
entry point is the composer's user-invocable `skills/list` surface: the catalog and
the `skill` tool never expose them, the `/` menu always does.

### b. `/how` — recorded by the operator, quoted as given

> 用户在 DeepSeek Harness 桌面会话里手动输入 `/how`，技能**从安装包真实加载**，返回的关键事实：
> - 技能名 `how`，base directory = `C:\Users\<name>\.dsh\profiles\desktop\node_modules\pstack-dsh\skills\how`（即安装副本内的 pstack-dsh 包，而非 vendored 上游）
> - 正文首行是适配层插入的指针：`In DeepSeek Harness, read [the DSH adapter](../../harness/dsh.md) once before following this step. It maps every Cursor name below to DSH, and says which fields to drop.`
> - 正文已被规则表改写并生效：`Every spawn is a \`subagent\``（上游原为 `Task`）、`the \`how explorer\` line in the \`~/.dsh/settings.yaml\` rule`（上游原为 `~/.cursor/rules/pstack-models.mdc`）
> - 同一会话的模型侧 catalog 里 `how` 报 `not available for model invocation`，而用户 `/how` 成功 —— 两件事同时成立，正好印证 DSH 的 user-invocable 唯一入口语义

### c. `/poteto-mode` — recorded by the operator, quoted as given

> 用户随后在同一会话手动输入 `/poteto-mode`，同样从安装副本真实加载：
> - base directory = `C:\Users\<name>\.dsh\profiles\desktop\node_modules\pstack-dsh\skills\poteto-mode`
> - 正文第 2 行是适配层指针：`In DeepSeek Harness, read [the DSH adapter](../../harness/dsh.md) once before following this step.`
> - 正文明确写出兄弟技能寻址方式：`Bundled skills live at \`../<name>/SKILL.md\` from this file, so put this file's absolute path in every pstack delegate prompt.`
> ⇒ 结合 DSH 在 `skill` 工具返回里附带 base directory 这一事实，"poteto-mode 启动后模型能定位兄弟技能与 principles"的链路**已实测成立**

### d. Independent re-check of those files (this run, read-only)

The two claims above can be checked without a GUI, by looking at what is actually
installed. `%USERPROFILE%` stands in for the operator's home directory:

```
$ ls %USERPROFILE%\.dsh\profiles\desktop\node_modules\pstack-dsh\skills\how\references\explainer-prompt.md
-rw-r--r-- 13 … explainer-prompt.md                      # sibling file an in-skill path needs
$ ls %USERPROFILE%\.dsh\profiles\desktop\node_modules\pstack-dsh\harness\dsh.md
-rw-r--r--  9 … dsh.md                                   # the adapter the pointer points at
$ awk 'NR<=12' …\skills\how\SKILL.md
 5| ---
 7| # How
 9| In DeepSeek Harness, read [the DSH adapter](../../harness/dsh.md) once before following this step. …
11| Explore the codebase to answer "how does X work?" questions. …
$ grep -nF 'Every spawn is a `subagent`' …\skills\how\SKILL.md
13:Every spawn is a `subagent`. Explorers use the `how explorer` line in the `~/.dsh/settings.yaml` rule …
$ grep -nF 'Every spawn is a Task subagent' vendor/pstack/skills/how/SKILL.md
11:Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`. …
$ grep -nF 'Bundled skills live at `../<name>/SKILL.md`' …\skills\poteto-mode\SKILL.md
13:Bundled skills live at `../<name>/SKILL.md` from this file, so put this file's absolute path in every pstack delegate prompt.
$ grep -nE '^(name|disable-model-invocation):' …\skills\{how,poteto-mode,setup-pstack}\SKILL.md
how/SKILL.md:2:name: how
how/SKILL.md:4:disable-model-invocation: true
poteto-mode/SKILL.md:2:name: poteto-mode
poteto-mode/SKILL.md:4:disable-model-invocation: true
setup-pstack/SKILL.md:2:name: setup-pstack          # no disable-model-invocation line: this is the callable one
```

So: the pointer is the first paragraph under the H1 (line 9 of `how`, line 11 of
`poteto-mode`), the two rewritten sentences are the shipped text while upstream
still says `Task` / `pstack-models.mdc`, and both relative targets
(`references/explainer-prompt.md` beside the skill, `../../harness/dsh.md` at the
package root) exist inside the installed copy. The relative-path route resolves.

### e. Conclusion

The load chain is proven end to end: `pnpm add "github:…"` → DSH bundle patch →
`extensions/dsh/index.js` → the `pstack-skills` provider → a real `/how` and a real
`/poteto-mode`, both served from the installed copy with the adaptation applied.
The 57 non-invocable skills are reached exactly as designed: the user types
`/<name>`; the body arrives with its base directory; any sibling it names resolves
from there. That is the same route upstream prescribes for Claude Code in
`vendor/pstack/docs/harness/claude-code.md` ("the `Skill` tool refuses most pstack
skills" → read the file instead).

### f. Still unverified — one manual item, stated narrowly

One hop has not been exercised: **after `/poteto-mode` starts, a real orchestration
run in which the model itself opens a sibling** (`../<name>/SKILL.md`) and a
`principles` reference, then acts on them. What is proven is that the paths exist and
that the body instructs the model to use them; what is not proven is a recorded run
where that actually happened.

To close it: in a DSH desktop session, type `/poteto-mode`, give it a task that
requires delegating (e.g. "review `skills/how/SKILL.md`'s subsystem and hand the
write-up to a subagent"), and record the tool calls. Expected: the model reads
`skills/<sibling>/SKILL.md` via the base directory and quotes from
`skills/poteto-mode/references/`. Until such a recording exists, this item stays
open — it is not covered by anything above.

## A9 — post-push install smoke

See the run recorded in the last commit of this repository (`git log -1`): a fresh
`git clone --depth 1`, `pnpm add "github:canine4455/pstack-dsh"`, then

```
$ node node_modules/pstack-dsh/tools/verify-install.mjs --strict
…
verify-install: 14 passed, 1 skipped, 0 failed
strict: every skip is on the whitelist ["peer-import"]
$ node tools/check-name-conflicts.mjs
…
host skills seen: 0
name conflicts: 0
NOTE no host skill roots exist on this machine; the scan proved nothing here (expected on CI, not in a profile)
```

and a byte comparison of the installed copy against that tag's tree, so "what the
remote installs" and "what the repository says" are the same bytes, not two
independently generated trees.

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
10. **`§7`'s two logging rules conflict — and the first version resolved the wrong
    one.** "A no-change run also records a row" and "the second consecutive run must
    make zero commits" cannot both hold for an appended row. The earlier resolution
    kept the row and deduped it by `(date, version, result)`, which quietly meant a
    no-change run still produced a commit on its first appearance — the opposite of
    what the workflow comment claimed. The resolution now: **a no-change run writes
    nothing at all**, so the two rules cannot conflict, and the row dedupe remains
    only as a backstop. A5 records the corrected behaviour and the one historical
    `No change` row is kept, not rewritten.
11. **Three platform-divergence bugs were found by running it**, not by review:
    CRLF vendoring, an OS-dependent path separator inside the manifest digest,
    and executable-bit churn. All three are fixed, and the workflow now sets
    `core.fileMode false`. This is why run 1 (`Synced bb68f23`) and run 3 differ
    in the log from the later no-change runs — the log is telling the truth.
12. **Four claims in the first version were stronger than the code behind them.**
    Each is now either implemented or withdrawn:
    - "Frontmatter is upstream's, unmodified" was false for one line: the `automate-me`
      description is rewritten (`via create-skill` → `via the skill-authoring
      guidance`) because the rule table applies to prose. Fixed by describing the
      key set as unmodified and the description as rewritable, in
      `extensions/dsh/index.js` and in `harness/dsh.md`.
    - "A run that finds no upstream change produces no commit" was true only after
      `33e1a3a`; before it, two bot commits carried the same `sync:` message. See A5.
    - "Name conflicts: 0" was a shell loop's output that nobody could re-run. It is
      now `tools/check-name-conflicts.mjs`, wired into `verify-install.mjs`, the
      sync workflow and the new `check.yml`.
    - "The patch target import SKIPs outside DSH" let a *dead copy* of this package
      pass with "1 skipped, 0 failed". `verify-install.mjs --strict` now fails on
      every skip except that single whitelisted one, and a copy whose
      `extensions/dsh/index.js` exports no `apply` is red.
13. **The guard skipped its drift policy without saying so** when there was no
    `.git`/HEAD (an installed copy, or a fresh checkout). It now prints
    `NOTE drift policy skipped: …` every time, so "nothing to compare against" is
    visibly different from "compared and clean".
14. **CRLF normalisation had two owners with opposite opinions**: `adapt.mjs`
    normalised, `check-adaptation.mjs` called CRLF upstream a failure. The policy is
    now an explicit entry in the machine-readable table (`"lineEndings": "crlf-to-lf"`)
    that both tools read from `tools/rules.mjs`; upstream is LF today, so it is a
    no-op that can no longer happen silently.
15. **`tools/adapt.mjs` used to `rmSync` before it validated.** A missing source
    directory left a half-written mirror that the next run would treat as baseline.
    It now builds everything in memory, checks, and only then writes; A5 records the
    two negative tests (missing source, missing skill) that show the tree untouched.
16. **One rule-table pointer bug was latent, not visible**: the pointer href was
    hardcoded to `../../harness/dsh.md`. It is now computed from each file's depth,
    so a `SKILL.md` that moves a level still points at the adapter doc.

## Two additions beyond §4's tree

- **`agents/`** is shipped (2 briefs, adapted) because §6 requires
  `agents/comment-sicko.md` to travel with the repo as a subagent prompt body,
  and `vendor/` must stay verbatim upstream, so it cannot live there.
- **`extensions/dsh/skills.generated.json`** is the generated manifest (§7 asks
  for generated fragments under `extensions/`). It records the upstream version,
  a vendor digest, and a hash per `SKILL.md`; the guard verifies the tree against
  it, which is what makes "skills/ was not hand-edited" checkable.