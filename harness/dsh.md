# pstack in DeepSeek Harness

Read this file once per session if you are about to follow a pstack skill. The
skills in `skills/` are upstream pstack bodies with the rewrites below applied;
anything this file does not map is upstream's, and upstream still means what it
says.

`<pstack>` below means this package's root, i.e. the directory holding `skills/`.

## What is already handled, and what you must do

Handled for you (do not re-do it):

- **Cursor-only names are rewritten** to DSH vocabulary. The rewrite is executed
  by `tools/adapt.mjs` from the machine-readable table at the bottom of this
  file and verified by `tools/check-adaptation.mjs`. If you find a Cursor name
  in a skill, that is a bug in the mirror, not an instruction to you.
- **Frontmatter keys are upstream's, unmodified.** DSH parses `name`,
  `description`, `disable-model-invocation`, `user-invocable`, and `metadata`; it
  silently drops `icon`, `color`, and `paths`. The only frontmatter text that
  changes is `description`, which passes through the same rewrite table as the
  body. `disable-model-invocation: true` is honoured, which has a consequence you
  must know (next section).

Yours to do:

- **Fields the DSH tool schema rejects are never passed.** If a skill's prose
  still names a field this file marks "drop the field", drop it. Never invent a
  DSH field to replace it.

## The one consequence that changes how you reach these skills

57 of the 58 skills carry `disable-model-invocation: true`. DSH honours that key:

- they appear in the user's `/` skill menu (badged user-only) and **not** in your
  model-facing skill catalog;
- the `skill` tool refuses them by name;
- only `setup-pstack` is model-invocable.

So to run one of them, read its body and follow it:

    Read <pstack>/skills/<name>/SKILL.md in full before any work.

That is the same route upstream prescribes for Claude Code, where the `Skill`
tool also refuses most pstack skills. When you tell the user to run one, write
`/<name>` — in DSH that is a real slash command that injects the body.

## Mapping table

| Cursor write-up | DSH handling |
| --- | --- |
| ``Task``, `Agent`, `spawn_agent`, ``task`` | The DSH subagent tool: `subagent` for a one-off, `spawn_teammate` for a named durable lane. |
| `subagent_type: generalPurpose` | DSH has no agent-type registry. Spawn `subagent` with the brief inline. Rewritten away. |
| `subagent_type: "poteto-agent"` | No such registered type. Spawn a general-purpose `subagent` and open its prompt with: `Read <pstack>/skills/poteto-mode/SKILL.md in full, including its Principles section, before any work.` |
| `subagent_type: "comment-sicko"` | Same, with `agents/comment-sicko.md` inlined as the prompt body (shipped in this package, already adapted). |
| `readonly: true` / `readonly: false` | Drop the field. DSH has no read-only subagent mode; state the intent in the brief instead ("do not write"). |
| `run_in_background: true` | Drop the field. DSH subagents are asynchronous; the call returns an id and reports later. |
| `environment: "cloud"` | Drop it. There is no DSH cloud agent; use a local run, or one git worktree per lane when lanes must not share state. |
| `environment: "local"` | Drop it. Local is the only mode. |
| `cloud_base_branch` | Drop it. Start the lane from a worktree created at the branch you need. |
| An open todolist / `TodoWrite` | Use `todo_write` when the session offers it, else keep the list in your reply. |
| `AskQuestion` | `ask_user_question`. Reserve it for a product or preference call; a fact you could observe is not the human's to answer. |
| A pstack command, ``/how``, ``/why``, ``/arena``, ``/architect``, ``/interrogate``, ``/swarm``, ``/reflect``, ``/poteto-mode``, ``/setup-pstack`` | These are skills here, not commands on some other harness. Read `skills/<name>/SKILL.md` and follow it, or tell the user to type `/<name>`. |
| ``/loop`` | `schedule_create` (interval or cron). |
| ``/deslop`` (the `cursor-team-kit` plugin) | Gone. The mirror rewrites every occurrence to the **unslop** skill, which ships here. |
| `create-skill` (a Cursor built-in) | Gone as a callable. The mirror rewrites it to this repo's skill-authoring guidance; `skills/create-verification-skill` covers the verification case. |
| `control-ui` / `control-cli` (from `cursor-team-kit`) | A repo's own control skill or named driver. The mirror drops the plugin provenance; keep the concept — drive the real surface. |
| `Bugbot` | A GitHub PR review bot, not a Cursor API. Its comments are ordinary review threads: triage them with `gh`, per `skills/poteto-mode/references/bugbot-triage.md`. Left as written on purpose. |
| Cursor Automations: routines, `update_state`, `api2.cursor.sh` webhooks, `SendToUser` | Skip the step with a one-line note. There is no DSH equivalent, and inventing one would be a lie. |
| `~/.cursor/rules/pstack-models.mdc` (role to model, one line per role) | Rewritten to `~/.dsh/settings.yaml`. DSH has no per-role model map: it sets `providers.*.models[]` with `reasoningEfforts`. See the `/setup-pstack` row. |
| Model slugs (`claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`, `composer-*`, `inherit-parent`, `auto`) | Upstream's Cursor defaults, left as written. They are **not** DSH slugs. Read them as "a strong judgment model", "a fast code model", "the parent model" and pick the DSH model that plays that role. |
| `~/.cursor/skills/`, `.cursor/skills/`, `~/.cursor/plugins/`, `.cursor/rules/`, `.cursor/worktrees/` | Rewritten to the `.dsh` equivalents (`~/.dsh/skills/`, `.dsh/skills/`, `~/.dsh/plugins/`, `.dsh/`, `.dsh/worktrees/`). |
| `agent-transcripts/` (Cursor's transcript layout) | Rewritten to `session-transcripts/` under `~/.dsh/projects/`. DSH's own session store is build-dependent: if the path you were given does not exist, ask the operator for the transcript path instead of guessing. |
| `/setup-pstack`'s reasoning budget and model split | **Do not write the operator's config.** Emit a snippet and let them adopt it by hand. See the shape below. |
| `.claude-plugin/plugin.json`, `Cursor [Aa]utomations`, `api2.cursor.sh` | Not applicable in DSH. |
| Mentions of Claude Code, OpenCode, Codex, Pi | Keep. They are other harnesses, not instructions to you. |

### The `/setup-pstack` snippet

```yaml
# ~/.dsh/settings.yaml — adopt by hand; this mirror never writes it.
providers:
  <provider>:
    models:
      - id: <strong-judgment-model>
        reasoningEfforts: [xhigh, high]   # upstream "judgment and prose", "hardest tasks"
      - id: <fast-code-model>
        reasoningEfforts: [high, medium]  # upstream "feature/refactoring", "bug-fix", "swarm workers"
```

Upstream's role list maps onto exactly two things in DSH: which model, and how
much reasoning effort. A role whose upstream value is `inherit-parent` or `auto`
means "the parent chat's model" — omit the override.

## Machine-readable table

`tools/adapt.mjs` executes this block and `tools/check-adaptation.mjs` proves its
coverage, so the mapping a human reads here and the rewrite a machine runs cannot
drift apart.

<!-- adapt-rules:start -->
```json
{
  "pointerWhen": "`Task`|\\bTask (tool|subagent|call|spawn|error)|subagent_type|environment: \"(cloud|local)\"|run_in_background|readonly: (true|false)|cloud_base_branch|/deslop|create-skill|cursor-team-kit|\\.cursor|agent-transcripts|AskQuestion|pstack-models\\.mdc|`/[a-z]",
  "pointer": "In DeepSeek Harness, read [the DSH adapter](../../harness/dsh.md) once before following this step. It maps every Cursor name below to DSH, and says which fields to drop.",
  "rules": [
    { "id": "params-how-spawn", "exact": true, "find": "Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`.", "replace": "Every spawn is a `subagent`." },
    { "id": "params-why-spawn", "exact": true, "find": "Every spawn is `generalPurpose` with `readonly: false` (agent mode).", "replace": "Every spawn is a `subagent` in agent mode." },
    { "id": "params-swarm-spawn", "exact": true, "find": "`subagent_type: generalPurpose`, `environment: \"cloud\"`, `run_in_background: true`, and the step 3 model, left unset for `auto` or `inherit-parent`.", "replace": "asynchronous `subagent` calls and the step 3 model, left unset for `auto` or `inherit-parent`." },
    { "id": "params-poteto-use", "exact": true, "find": "**Use `subagent_type: \"poteto-agent\"` for any subagent you spawn inside a playbook step** (code-writing delegates, ad-hoc helpers).", "replace": "**For any subagent you spawn inside a playbook step, spawn a general-purpose `subagent` whose prompt opens with `Read <pstack>/skills/poteto-mode/SKILL.md in full, including its Principles section, before any work.`** (code-writing delegates, ad-hoc helpers)." },
    { "id": "params-agent-mode", "exact": true, "find": "agent mode (`readonly: false`)", "replace": "agent mode" },
    { "id": "prose-kit-runtime-check", "exact": true, "find": "a `control-ui` or `control-cli` runtime check (from `cursor-team-kit`)", "replace": "a control-skill runtime check" },
    { "id": "prose-setup-rule", "exact": true, "find": "in the `/setup-pstack` rule", "replace": "in the **setup-pstack** skill's rule" },
    { "id": "prose-setup-budget", "exact": true, "find": "The `/setup-pstack` budget sets", "replace": "The **setup-pstack** skill's budget sets" },
    { "id": "prose-ketchup-earlier", "exact": true, "find": "not before any earlier `/ketchup`.", "replace": "not before any earlier catch-up." },
    { "id": "prose-poteto-uses", "exact": true, "find": "`/poteto-mode` already uses `poteto-agent` for the subagents its playbook steps spawn.", "replace": "The **poteto-mode** skill already uses a pstack delegate for the subagents its playbook steps spawn." },
    { "id": "prose-poteto-matches", "exact": true, "find": "`/poteto-mode` matches the task to a playbook", "replace": "The **poteto-mode** skill matches the task to a playbook" },
    { "id": "prose-kit-ships", "exact": true, "find": "- `/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.", "replace": "- **unslop**, `control-cli`, and `control-ui` ship in the control-skill plugin." },
    { "id": "prose-builtins", "exact": true, "find": "- `/loop` and `/create-skill` are Cursor built-ins.", "replace": "- `schedule_create` covers `/loop`; this repo's skill-authoring guidance covers skill scaffolding." },
    { "id": "prose-orchestrate-playbook", "exact": true, "find": "Orchestrate is a `/poteto-mode` playbook.", "replace": "Orchestrate is a **poteto-mode** playbook." },
    { "id": "prose-prose-follows", "exact": true, "find": "Agent-facing prose also follows the **create-skill** skill (Cursor's built-in for authoring SKILL.md files).", "replace": "Agent-facing prose also follows this repo's skill-authoring guidance." },
    { "id": "prose-authoring-skill", "exact": true, "find": "Use the **create-skill** skill (Cursor's built-in for authoring SKILL.md files).", "replace": "Use this repo's skill-authoring guidance." },
    { "id": "prose-before-review", "exact": true, "find": "- Before review → the **no-comments** skill (`/no-comments`).", "replace": "- Before review → the **no-comments** skill." },
    { "id": "prose-no-comments-pass", "exact": true, "find": "and the `/no-comments` pass", "replace": "and the **no-comments** pass" },
    { "id": "prose-defaults-spawn", "exact": true, "find": "**Defaults for every `Task` call.** `run_in_background: true` (a steer or resume of a running agent too, because a foreground call holds your turn while other reports wait), agent mode", "replace": "**Defaults for every `subagent` call.** An asynchronous spawn (a steer or resume of a running agent too, because a foreground call holds your turn while other reports wait), agent mode" },
    { "id": "prose-mode-benchmark", "exact": true, "find": "A `create-skill`-style test/iterate benchmark loop isn't useful here.", "replace": "A skill-authoring-style test/iterate benchmark loop isn't useful here." },
    { "id": "prose-setup-snippet", "exact": true, "find": "Write `~/.cursor/rules/pstack-models.mdc`, an always-applied rule that sets pstack's model per role.", "replace": "Emit the equivalent `~/.dsh/settings.yaml` snippet that sets pstack's model per role. Do not write that file yourself; the operator adopts it by hand." },
    { "id": "prose-setup-shape", "exact": true, "find": "Write `~/.cursor/rules/pstack-models.mdc` with `alwaysApply: true`, a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:", "replace": "Emit a `~/.dsh/settings.yaml` snippet: a comment line naming the chosen budget and its target effort, and one entry per role, using the same labels poteto-mode uses. Show it in a fenced block; the operator adopts it by hand and this skill never writes it. Shape:" },
    { "id": "prose-setup-detect", "exact": true, "find": "Enumerate the model slugs you can pass to a `Task` subagent in this session.", "replace": "Enumerate the model slugs you can pass to a `subagent` in this session." },
    { "id": "prose-agent-run", "exact": true, "find": "spawned during a `/poteto-mode` run. Use for delegates, not as the runner for `/poteto-mode` itself.", "replace": "spawned during a **poteto-mode** run. Use for delegates, not as the runner for **poteto-mode** itself." },
    { "id": "task-tool-backtick", "find": "`Task`", "replace": "`subagent`" },
    { "id": "task-tool-words", "find": "\\bTask (tool|subagent|call|spawn|error)", "replace": "subagent $1" },
    { "id": "task-model", "find": "Task `model`", "replace": "subagent `model`" },
    { "id": "ask-question", "find": "`AskQuestion`", "replace": "`ask_user_question`" },
    { "id": "ask-question-bare", "find": "\\bAskQuestion\\b", "replace": "ask_user_question" },
    { "id": "model-config-path", "find": "`?~/\\.cursor/rules/pstack-models\\.mdc`?", "replace": "`~/.dsh/settings.yaml`" },
    { "id": "model-config-rule", "find": "`pstack-models\\.mdc`", "replace": "`~/.dsh/settings.yaml`" },
    { "id": "cursor-home-skills", "find": "~/\\.cursor/skills/", "replace": "~/.dsh/skills/" },
    { "id": "cursor-home-plugins", "find": "~/\\.cursor/plugins/", "replace": "~/.dsh/plugins/" },
    { "id": "cursor-home-projects", "find": "~/\\.cursor/projects/", "replace": "~/.dsh/projects/" },
    { "id": "cursor-home", "find": "~/\\.cursor/", "replace": "~/.dsh/" },
    { "id": "cursor-project", "find": "\\.cursor/", "replace": ".dsh/" },
    { "id": "cursor-plugin-dir", "find": "\\.cursor-plugin/", "replace": ".dsh-plugin/" },
    { "id": "cursor-automation-host", "find": "api2\\.cursor\\.sh", "replace": "the Cursor automation service" },
    { "id": "agent-transcripts", "find": "agent-transcripts", "replace": "session-transcripts" },
    { "id": "deslop-full", "find": "the `deslop` skill from the `cursor-team-kit` plugin \\(`/deslop`\\)", "replace": "the **unslop** skill" },
    { "id": "deslop-from-kit", "find": "`/deslop` from `cursor-team-kit`", "replace": "the **unslop** skill" },
    { "id": "deslop-command", "find": "`/deslop`", "replace": "the **unslop** skill" },
    { "id": "deslop-name", "find": "`deslop` skill", "replace": "**unslop** skill" },
    { "id": "create-skill-builtin", "find": "Cursor's built-in `create-skill`( skill)?", "replace": "this repo's skill-authoring guidance" },
    { "id": "create-skill-name", "find": "`create-skill`", "replace": "the skill-authoring guidance" },
    { "id": "create-skill-bare", "find": "create-skill", "replace": "the skill-authoring guidance" },
    { "id": "kit-control-both", "find": "`control-ui` or `control-cli`( runtime check)? \\(from `cursor-team-kit`\\)", "replace": "the repo's control skill" },
    { "id": "kit-control-ui", "find": "`control-ui` from `cursor-team-kit`", "replace": "the repo's UI control skill" },
    { "id": "kit-control-cli", "find": "`control-cli` from `cursor-team-kit`", "replace": "the repo's CLI control skill" },
    { "id": "kit-provenance", "find": " from `cursor-team-kit`", "replace": "" },
    { "id": "kit-publishes", "find": "`cursor-team-kit` publishes", "replace": "The control-skill plugin publishes" },
    { "id": "kit-name", "find": "`cursor-team-kit`", "replace": "the control-skill plugin" },
    { "id": "env-cloud-run", "find": "on a new cloud VM \\(`environment: \"cloud\"`\\)", "replace": "in a fresh git worktree" },
    { "id": "env-cloud-field", "find": ", `environment: \"cloud\"`,?", "replace": "," },
    { "id": "env-cloud-standalone", "find": "`environment: \"cloud\"`,? ?", "replace": "" },
    { "id": "env-local-field", "find": "`environment: \"local\"`", "replace": "a local run" },
    { "id": "cloud-base-branch", "find": "When a worker must start from a non-default pushed branch, pass `cloud_base_branch`\\.", "replace": "When a worker must start from a non-default pushed branch, create its worktree at that branch first." },
    { "id": "subagent-type-general", "find": "`subagent_type: general-?[Pp]urpose`,? ?", "replace": "" },
    { "id": "subagent-type-poteto", "find": "`subagent_type: \"poteto-agent\"`", "replace": "a general-purpose `subagent` whose prompt opens with: `Read <pstack>/skills/poteto-mode/SKILL.md in full, including its Principles section, before any work.`" },
    { "id": "subagent-type-sicko", "find": "`subagent_type: \"comment-sicko\"`", "replace": "a `subagent` whose prompt body is `agents/comment-sicko.md` verbatim" },
    { "id": "subagent-type-bare", "find": "`subagent_type`", "replace": "delegation brief" },
    { "id": "poteto-agent-name", "find": "`poteto-agent`", "replace": "pstack delegate" },
    { "id": "comment-sicko-name", "find": "`comment-sicko`", "replace": "comment reviewer" },
    { "id": "readonly-field", "find": "`readonly: (true|false)`", "replace": "agent mode" },
    { "id": "run-in-background", "find": "`run_in_background: true`", "replace": "an asynchronous spawn" },
    { "id": "slash-pstack-skill", "find": "`/(how|why|arena|architect|interrogate|swarm|reflect|poteto-mode|setup-pstack|figure-it-out|ketchup|no-comments|unslop|bro|correct|automate-me|show-me-your-work)`", "replace": "the **$1** skill" }
  ],
  "forbid": [
    { "id": "task-tool", "pattern": "`Task`|\\bTask (tool|subagent|call|spawn|error|`model`)" },
    { "id": "subagent-type", "pattern": "subagent_type" },
    { "id": "cloud-env", "pattern": "environment: \"(cloud|local)\"" },
    { "id": "cloud-base-branch", "pattern": "cloud_base_branch" },
    { "id": "background-field", "pattern": "run_in_background" },
    { "id": "deslop", "pattern": "/deslop" },
    { "id": "cursor-team-kit", "pattern": "cursor-team-kit" },
    { "id": "create-skill", "pattern": "create-skill" },
    { "id": "cursor-path", "pattern": "\\.cursor" },
    { "id": "agent-transcripts", "pattern": "agent-transcripts" },
    { "id": "ask-question", "pattern": "AskQuestion" },
    { "id": "pstack-models-rule", "pattern": "pstack-models\\.mdc" }
  ]
}
```
<!-- adapt-rules:end -->