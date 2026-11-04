#!/usr/bin/env node
/**
 * Guard for the generated mirror. `tools/adapt.mjs` is the only writer of
 * skills/ and agents/, so this file checks the generator rather than trusting
 * it. Seven independent proofs:
 *
 *   1. rule table    - the table is well formed and line-local (no `find`
 *                      contains a newline), so "a rule can only touch lines it
 *                      matches" is a property, not a hope.
 *   2. byte fidelity - every shipped markdown file equals the shared transform of
 *                      upstream (tools/rules.mjs — the same code the generator
 *                      runs), and differs from upstream only on lines a rule
 *                      actually matches; every non-markdown file is byte-identical.
 *   3. no bare text  - each forbidden Cursor construct is absent.
 *   4. frontmatter   - parseable, name equals directory, unique, and any change
 *                      from upstream is attributable to a rule.
 *   5. structure     - the skill directory set equals the manifest's, and the
 *                      count equals EXPECTED_SKILLS (tools/expected.mjs).
 *   6. drift policy  - an upstream deletion, rename, or a large change in skill
 *                      count fails loudly instead of shrinking silently. Without
 *                      a git HEAD to compare against, this prints a NOTE instead
 *                      of passing silently.
 *   7. hygiene       - no real local absolute path (C:\Users\<name>, /Users/<name>,
 *                      /home/<name>) outside vendor/, and no credential-shaped
 *                      string anywhere. The scan patterns are written so they
 *                      cannot match their own source line.
 *
 * Exit 1 on any failure. In GitHub Actions it emits ::error:: annotations and
 * writes a job summary; the sync workflow and the push-triggered check.yml both
 * red-fail and say why.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_SKILLS, skillCountHint } from "./expected.mjs";
import { adaptMarkdown, pointerLine, readAdapterRules, ruleMatches } from "./rules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "pstack");
const ADAPTER = join(ROOT, "harness", "dsh.md");
const MANIFEST = join(ROOT, "extensions", "dsh", "skills.generated.json");
const TREES = ["skills", "agents"];

/**
 * Path segments that are placeholders, not a real account name. Anything else
 * after Users/ or home/ is somebody's machine and does not belong in this repo.
 */
const PLACEHOLDER_SEGMENTS = new Set([
  "<name>", "<user>", "<profile>", "<you>", "%username%", "%user%", "${user}", "$user",
  "{name}", "{user}", "you", "your-name", "yourname", "me", "example", "user", "username",
]);

/** Real-absolute-path shapes. Bracket-free so a quoted command cannot self-match. */
const LOCAL_PATH_PATTERNS = [
  { id: "windows-users", re: /[A-Za-z]:[\\/]+Users[\\/]+([A-Za-z0-9._-]+)/g },
  { id: "posix-users", re: /\/Users\/([A-Za-z0-9._-]+)/g },
  { id: "posix-home", re: /\/home\/([A-Za-z0-9._-]+)/g },
];

/**
 * Credential shapes. The prefixes are written as bracket expressions
 * (`gh[p]_`, `github[_]pat_`) so this file and the docs that quote the command
 * cannot match their own pattern text — a scan that only ever finds itself
 * proves nothing and cannot be reproduced with "(no output)".
 */
const SECRET_PATTERN =
  "gh[p]_|gh[o]_|gh[u]_|github[_]pat_|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY";

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);
const note = (message) => notes.push(message);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir, { skip = new Set() } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      if (name === ".DS_Store" || skip.has(name)) return [];
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path, { skip }) : [path];
    });
}

const rel = (path) => relative(ROOT, path).replace(/\\/g, "/");

let rules;
try {
  rules = readAdapterRules(ADAPTER);
} catch (err) {
  fail(`harness/dsh.md: ${err.message}`);
}
if (!rules) {
  for (const problem of problems) console.log(`FAIL ${problem}`);
  process.exit(1);
}

// 1. the rule table itself.
{
  const ids = new Set();
  for (const rule of rules.rules) {
    if (ids.has(rule.id)) fail(`rule table declares duplicate rule id ${JSON.stringify(rule.id)}`);
    ids.add(rule.id);
    if (typeof rule.find !== "string" || rule.find === "") fail(`rule ${JSON.stringify(rule.id)} has an empty find`);
    // Line-local by construction: this is what lets the byte audit below judge
    // one line at a time instead of eyeballing whole files.
    if (rule.find.includes("\n")) fail(`rule ${JSON.stringify(rule.id)} spans lines; the byte audit cannot attribute it`);
    if (typeof rule.replace !== "string") fail(`rule ${JSON.stringify(rule.id)} has no replace string`);
  }
}

if (!existsSync(join(VENDOR, "plugin.json"))) {
  fail("vendor/pstack/plugin.json is missing; upstream layout changed");
}

// 2. byte fidelity, per tree.
for (const tree of TREES) {
  const sourceDir = join(VENDOR, tree);
  const outDir = join(ROOT, tree);
  if (!existsSync(sourceDir)) {
    fail(`vendor/pstack/${tree}/ is missing; upstream layout changed`);
    continue;
  }
  const upstreamFiles = walk(sourceDir);
  const shippedFiles = walk(outDir);
  const upstreamSet = new Set(upstreamFiles.map((path) => relative(sourceDir, path).replace(/\\/g, "/")));
  const shippedSet = new Set(shippedFiles.map((path) => relative(outDir, path).replace(/\\/g, "/")));
  for (const relPath of upstreamSet) {
    if (!shippedSet.has(relPath)) fail(`${tree}/${relPath} exists upstream but is not shipped`);
  }
  for (const relPath of shippedSet) {
    if (!upstreamSet.has(relPath)) fail(`${tree}/${relPath} is shipped but does not exist upstream`);
  }
  let normalised = 0;
  for (const relPath of [...upstreamSet].sort()) {
    if (!shippedSet.has(relPath)) continue;
    const upstreamBytes = readFileSync(join(sourceDir, relPath));
    const shippedBytes = readFileSync(join(outDir, relPath));
    if (!relPath.endsWith(".md")) {
      if (!upstreamBytes.equals(shippedBytes)) fail(`${tree}/${relPath} is not byte-identical to upstream`);
      continue;
    }
    const upstream = upstreamBytes.toString("utf8");
    const relFromRoot = `${tree}/${relPath}`;
    const { text: expected, normalised: didNormalise } = adaptMarkdown(
      upstream,
      rules,
      relFromRoot,
      relPath.endsWith("SKILL.md"),
    );
    if (didNormalise) normalised += 1;
    const shipped = shippedBytes.toString("utf8");
    if (expected !== shipped) {
      fail(`${tree}/${relPath} is not rewrite(upstream); regenerate with tools/adapt.mjs`);
      continue;
    }
    // Line audit: drop the pointer line, then walk both sides. A differing
    // upstream line must be matched by a rule; a lone blank on the shipped side
    // is the paragraph break the pointer introduced.
    const pointer = relPath.endsWith("SKILL.md") ? pointerLine(rules.pointer, relFromRoot) : undefined;
    const normalisedUpstream = upstream.replace(/\r\n/g, "\n");
    const upstreamLines = normalisedUpstream.split("\n");
    const shippedLines = shipped.split("\n").filter((line) => line !== pointer);
    let i = 0;
    let j = 0;
    while (i < upstreamLines.length && j < shippedLines.length) {
      if (upstreamLines[i] === shippedLines[j]) {
        i += 1;
        j += 1;
      } else if (pointer && shippedLines[j] === "") {
        j += 1;
      } else if (rules.rules.some((rule) => ruleMatches(rule, upstreamLines[i]))) {
        i += 1;
        j += 1;
      } else {
        fail(`${tree}/${relPath}:${i + 1} changed with no matching rule in harness/dsh.md`);
        i = Infinity;
        break;
      }
    }
    if (i !== Infinity && (i !== upstreamLines.length || j !== shippedLines.length)) {
      fail(`${tree}/${relPath} changed its line count; rules may only rewrite within a line`);
    }
  }
  if (normalised > 0) note(`${tree}/: applied declared lineEndings "${rules.lineEndings}" to ${normalised} upstream file(s)`);
}

// 3. forbidden Cursor constructs must be absent from every shipped markdown file.
for (const tree of TREES) {
  for (const path of walk(join(ROOT, tree))) {
    if (!path.endsWith(".md")) continue;
    const text = readFileSync(path, "utf8");
    for (const { id, pattern } of rules.forbid) {
      const hit = new RegExp(pattern).exec(text);
      if (hit) {
        const line = text.slice(0, hit.index).split("\n").length;
        fail(`${rel(path)}:${line} still carries ${JSON.stringify(hit[0])} (${id})`);
      }
    }
  }
}

// 4. frontmatter: parseable, name matches the directory, unique, upstream bytes.
const skillsDir = join(ROOT, "skills");
const skillDirs = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((name) => statSync(join(skillsDir, name)).isDirectory()).sort()
  : [];
const seen = new Map();
for (const name of skillDirs) {
  const path = join(skillsDir, name, "SKILL.md");
  if (!existsSync(path)) {
    fail(`skills/${name}/SKILL.md is missing`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    fail(`skills/${name}/SKILL.md has no parseable frontmatter`);
    continue;
  }
  const declared = match[1].match(/^name:\s*(.+)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (declared !== name) fail(`skills/${name}/SKILL.md declares name ${JSON.stringify(declared ?? "")}`);
  if (!/^description:\s*\S/m.test(match[1])) fail(`skills/${name}/SKILL.md has no description`);
  if (seen.has(declared)) fail(`duplicate skill name ${JSON.stringify(declared)}: ${seen.get(declared)} and ${name}`);
  seen.set(declared, name);
  const upstream = join(VENDOR, "skills", name, "SKILL.md");
  if (existsSync(upstream)) {
    const upstreamBlock = readFileSync(upstream, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const upstreamLines = upstreamBlock.replace(/\r\n/g, "\n").split("\n");
    const shippedLines = match[1].split("\n");
    if (upstreamLines.length !== shippedLines.length) {
      fail(`skills/${name}/SKILL.md frontmatter changed its key set`);
    } else {
      for (let i = 0; i < upstreamLines.length; i += 1) {
        if (upstreamLines[i] === shippedLines[i]) continue;
        if (!rules.rules.some((rule) => ruleMatches(rule, upstreamLines[i]))) {
          fail(`skills/${name}/SKILL.md frontmatter line ${i + 1} changed with no matching rule`);
        }
      }
    }
  } else {
    fail(`skills/${name} has no upstream counterpart`);
  }
}
if (skillDirs.length !== EXPECTED_SKILLS) fail(skillCountHint(skillDirs.length));

// 5. structure: the shipped set must be the manifest's set, no more, no less.
const manifestExists = existsSync(MANIFEST);
let manifest;
if (manifestExists) {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch (err) {
    fail(`extensions/dsh/skills.generated.json does not parse: ${err.message}`);
  }
} else {
  fail("extensions/dsh/skills.generated.json is missing");
}
if (manifest) {
  const manifestNames = new Set((manifest.skills ?? []).map((entry) => entry.name));
  const diskNames = new Set(skillDirs);
  for (const name of manifestNames) if (!diskNames.has(name)) fail(`manifest lists ${name} but skills/${name} does not exist`);
  for (const name of diskNames) if (!manifestNames.has(name)) fail(`skills/${name} exists but the manifest does not list it`);
  if (manifest.skillCount !== skillDirs.length) {
    fail(`manifest records ${manifest.skillCount} skills, tree has ${skillDirs.length} — ${skillCountHint(skillDirs.length)}`);
  }
  for (const entry of manifest.skills ?? []) {
    const path = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(path) || sha256(readFileSync(path)) !== entry.sha256) {
      fail(`manifest hash for ${entry.name} does not match skills/${entry.name}/SKILL.md`);
    }
  }
  if (JSON.stringify(manifest.ruleIds) !== JSON.stringify(rules.rules.map((rule) => rule.id))) {
    fail("manifest ruleIds disagree with harness/dsh.md");
  }
}

// 6. drift policy: compare this tree against the manifest committed at HEAD.
{
  let prior;
  let why;
  try {
    prior = JSON.parse(
      execFileSync("git", ["show", `HEAD:${rel(MANIFEST)}`], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch (err) {
    why = String(err?.message ?? err).split("\n")[0];
  }
  if (!prior) {
    // An installed copy has no .git and a source checkout may have no commit yet.
    // Say so out loud: a guard that silently drops a proof is a guard that lies.
    note(`drift policy skipped: no HEAD manifest to compare against (${why ?? "git show returned nothing"}). This is expected in an installed copy; it is a gap in a source checkout.`);
  } else if (manifest) {
    const priorNames = new Set((prior.skills ?? []).map((entry) => entry.name));
    const currentNames = new Set((manifest.skills ?? []).map((entry) => entry.name));
    const removed = [...priorNames].filter((name) => !currentNames.has(name));
    const added = [...currentNames].filter((name) => !priorNames.has(name));
    if (removed.length > 0) fail(`upstream removed or renamed ${removed.length} skill(s): ${removed.join(", ")}`);
    const delta = Math.abs((manifest.skills?.length ?? 0) - (prior.skills?.length ?? 0));
    const baseline = Math.max(prior.skills?.length ?? 1, 1);
    if (delta / baseline > 0.1) {
      fail(`skill count changed by ${delta} of ${baseline}, more than 10%; refusing to shrink or grow silently`);
    }
    if (added.length > 0) note(`upstream added ${added.length} skill(s): ${added.join(", ")}`);
    if (prior.upstreamVersion !== manifest.upstreamVersion) {
      note(`upstream version ${prior.upstreamVersion} -> ${manifest.upstreamVersion}`);
    }
    if (prior.upstreamDigest !== manifest.upstreamDigest && added.length === 0 && removed.length === 0) {
      note("upstream content changed without changing the skill set");
    }
  }
}

// 7. hygiene: real local absolute paths and credential shapes.
{
  const all = walk(ROOT, { skip: new Set([".git", "node_modules"]) });
  const pathScan = all.filter((path) => !rel(path).startsWith("vendor/"));
  for (const path of pathScan) {
    if (statSync(path).size > 2_000_000) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // binary
    }
    if (text.includes("\u0000")) continue;
    for (const { id, re } of LOCAL_PATH_PATTERNS) {
      re.lastIndex = 0;
      for (const match of text.matchAll(re)) {
        const segment = match[1];
        if (PLACEHOLDER_SEGMENTS.has(segment.toLowerCase())) continue;
        const line = text.slice(0, match.index).split("\n").length;
        fail(`${rel(path)}:${line} carries a real local absolute path (${id}: ${JSON.stringify(match[0].slice(0, 80))}); use %USERPROFILE%\\… or <name> instead`);
      }
    }
  }
  const secret = new RegExp(SECRET_PATTERN, "i");
  for (const path of all) {
    if (statSync(path).size > 2_000_000) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue;
    const hit = secret.exec(text);
    if (hit) {
      const line = text.slice(0, hit.index).split("\n").length;
      fail(`${rel(path)}:${line} carries a credential-shaped string (${JSON.stringify(hit[0])})`);
    }
  }
}

for (const message of notes) console.log(`NOTE ${message}`);
if (problems.length > 0) {
  const ci = Boolean(process.env.GITHUB_ACTIONS);
  for (const problem of problems.slice(0, 50)) console.log(ci ? `::error::${problem}` : `FAIL ${problem}`);
  if (problems.length > 50) console.log(`FAIL ... and ${problems.length - 50} more`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(summary, `\n### Guard failed\n\n${problems.slice(0, 50).map((p) => `- ${p}`).join("\n")}\n`);
  }
  process.exit(1);
}

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  appendFileSync(
    summary,
    `\n### Guard passed\n\n${skillDirs.length} skills, ${walk(skillsDir).length + walk(join(ROOT, "agents")).length} shipped files, ` +
      `${rules.rules.length} rewrite rules, ${rules.forbid.length} forbidden constructs at zero, 0 real local paths, 0 credential shapes.` +
      (notes.length > 0 ? `\n\n${notes.map((n) => `- ${n}`).join("\n")}\n` : "\n"),
  );
}
console.log(`adaptation guard passed: ${skillDirs.length} skills, ${rules.rules.length} rules, 0 forbidden constructs, 0 real local paths, 0 credential shapes.`);
console.log(`adapter: harness/dsh.md`);