#!/usr/bin/env node
/**
 * Guard for the generated mirror. `tools/adapt.mjs` is the only writer of
 * skills/ and agents/, so this file checks the generator rather than trusting
 * it. Five independent proofs:
 *
 *   1. byte fidelity  - every shipped markdown file equals
 *                       rewrite(upstream) and differs from upstream only on
 *                       lines a rule in harness/dsh.md actually matches;
 *                       every non-markdown file is byte-identical.
 *   2. no bare text   - each forbidden Cursor construct is absent.
 *   3. frontmatter    - parseable, name equals directory, unique, and byte
 *                       identical to upstream (DSH parses it as upstream wrote it).
 *   4. structure      - exactly the expected skill directory set.
 *   5. drift policy   - an upstream deletion, rename, or a large change in
 *                       skill count fails loudly instead of shrinking silently.
 *
 * Exit 1 on any failure. In GitHub Actions it emits ::error:: annotations and
 * writes a job summary; the sync workflow red-fails and says why.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "pstack");
const ADAPTER = join(ROOT, "harness", "dsh.md");
const MANIFEST = join(ROOT, "extensions", "dsh", "skills.generated.json");
const TREES = ["skills", "agents"];
const MARK_START = "<!-- adapt-rules:start -->";
const MARK_END = "<!-- adapt-rules:end -->";

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      if (name === ".DS_Store") return [];
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function readRules() {
  const markdown = readFileSync(ADAPTER, "utf8");
  const start = markdown.indexOf(MARK_START);
  const end = markdown.indexOf(MARK_END);
  if (start < 0 || end < 0) throw new Error("harness/dsh.md has no machine-readable rule block");
  const fenced = markdown.slice(start + MARK_START.length, end);
  const json = fenced.replace(/^[\s\S]*?```json\r?\n/, "").replace(/```[\s\S]*$/, "");
  return JSON.parse(json);
}

const rules = readRules();
/** Same semantics as tools/adapt.mjs: `exact` rules are literal string edits,
 *  everything else is a regular expression. Kept in lockstep on purpose. */
const applies = (rule, text) =>
  rule.exact ? text.split(rule.find).join(rule.replace) : text.replace(new RegExp(rule.find, rule.flags ?? "g"), rule.replace);
const matches = (rule, text) => (rule.exact ? text.includes(rule.find) : new RegExp(rule.find).test(text));

if (!existsSync(join(VENDOR, "plugin.json"))) {
  fail("vendor/pstack/plugin.json is missing; upstream layout changed");
}

// 1. byte fidelity, per tree.
for (const tree of TREES) {
  const sourceDir = join(VENDOR, tree);
  const outDir = join(ROOT, tree);
  if (!existsSync(sourceDir)) {
    fail(`vendor/pstack/${tree}/ is missing; upstream layout changed`);
    continue;
  }
  // Upstream is LF. If that ever changes, normalisation would silently break
  // byte fidelity, so say so instead of hiding it.
  for (const path of walk(sourceDir)) {
    if (path.endsWith(".md") && readFileSync(path).includes(13)) {
      fail(`${relative(ROOT, path)} carries CRLF; upstream is LF and the mirror normalises to LF`);
    }
  }
  const upstreamFiles = walk(sourceDir);
  const shippedFiles = walk(outDir);
  const upstreamSet = new Set(upstreamFiles.map((path) => relative(sourceDir, path)));
  const shippedSet = new Set(shippedFiles.map((path) => relative(outDir, path)));
  for (const rel of upstreamSet) {
    if (!shippedSet.has(rel)) fail(`${tree}/${rel} exists upstream but is not shipped`);
  }
  for (const rel of shippedSet) {
    if (!upstreamSet.has(rel)) fail(`${tree}/${rel} is shipped but does not exist upstream`);
  }
  for (const rel of upstreamSet) {
    if (!shippedSet.has(rel)) continue;
    const upstreamBytes = readFileSync(join(sourceDir, rel));
    const shippedBytes = readFileSync(join(outDir, rel));
    if (!rel.endsWith(".md")) {
      if (!upstreamBytes.equals(shippedBytes)) fail(`${tree}/${rel} is not byte-identical to upstream`);
      continue;
    }
    const upstream = upstreamBytes.toString("utf8").replace(/\r\n/g, "\n");
    let expected = upstream;
    for (const rule of rules.rules) expected = applies(rule, expected);
    const pointer = new RegExp(rules.pointerWhen).test(upstream) && rel.endsWith("SKILL.md") ? rules.pointer : undefined;
    if (pointer) expected = expected.replace(/^(# .*)\n+/m, `$1\n\n${pointer}\n\n`);
    const shipped = shippedBytes.toString("utf8");
    if (expected !== shipped) {
      fail(`${tree}/${rel} is not rewrite(upstream); regenerate with tools/adapt.mjs`);
      continue;
    }
    // Line audit: drop the pointer line, then walk both sides. A differing
    // upstream line must be matched by a rule; a lone blank on the shipped side
    // is the paragraph break the pointer introduced. Proves the mirror cannot
    // quietly paraphrase anything the table does not list.
    const upstreamLines = upstream.split("\n");
    const shippedLines = shipped.split("\n").filter((line) => line !== pointer);
    let i = 0;
    let j = 0;
    while (i < upstreamLines.length && j < shippedLines.length) {
      if (upstreamLines[i] === shippedLines[j]) {
        i += 1;
        j += 1;
      } else if (pointer && shippedLines[j] === "") {
        j += 1;
      } else if (rules.rules.some((rule) => matches(rule, upstreamLines[i]))) {
        i += 1;
        j += 1;
      } else {
        fail(`${tree}/${rel}:${i + 1} changed with no matching rule in harness/dsh.md`);
        i = Infinity;
        break;
      }
    }
    if (i !== Infinity && (i !== upstreamLines.length || j !== shippedLines.length)) {
      fail(`${tree}/${rel} changed its line count; rules may only rewrite within a line`);
    }
  }
}

// 2. forbidden Cursor constructs must be absent from every shipped markdown file.
for (const tree of TREES) {
  for (const path of walk(join(ROOT, tree))) {
    if (!path.endsWith(".md")) continue;
    const text = readFileSync(path, "utf8");
    for (const { id, pattern } of rules.forbid) {
      const hit = new RegExp(pattern).exec(text);
      if (hit) {
        const line = text.slice(0, hit.index).split("\n").length;
        fail(`${relative(ROOT, path)}:${line} still carries ${JSON.stringify(hit[0])} (${id})`);
      }
    }
  }
}

// 3. frontmatter: parseable, name matches the directory, unique, upstream bytes.
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
    const upstreamLines = upstreamBlock.split("\n");
    const shippedLines = match[1].split("\n");
    if (upstreamLines.length !== shippedLines.length) {
      fail(`skills/${name}/SKILL.md frontmatter changed its key set`);
    } else {
      for (let i = 0; i < upstreamLines.length; i += 1) {
        if (upstreamLines[i] === shippedLines[i]) continue;
        if (!rules.rules.some((rule) => matches(rule, upstreamLines[i]))) {
          fail(`skills/${name}/SKILL.md frontmatter line ${i + 1} changed with no matching rule`);
        }
      }
    }
  } else {
    fail(`skills/${name} has no upstream counterpart`);
  }
}
if (skillDirs.length !== 58) fail(`expected 58 skill directories, found ${skillDirs.length}`);

// 5. drift policy: compare this tree against the manifest committed at HEAD.
const manifestDrift = (() => {
  if (!existsSync(MANIFEST)) return undefined;
  let prior;
  try {
    prior = JSON.parse(
      execFileSync("git", ["show", `HEAD:${relative(ROOT, MANIFEST).replace(/\\/g, "/")}`], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined;
  }
  const current = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const priorNames = new Set((prior.skills ?? []).map((entry) => entry.name));
  const currentNames = new Set((current.skills ?? []).map((entry) => entry.name));
  const removed = [...priorNames].filter((name) => !currentNames.has(name));
  const added = [...currentNames].filter((name) => !priorNames.has(name));
  return { prior, current, removed, added };
})();
if (manifestDrift) {
  const { prior, current, removed, added } = manifestDrift;
  if (removed.length > 0) {
    fail(`upstream removed or renamed ${removed.length} skill(s): ${removed.join(", ")}`);
  }
  const delta = Math.abs((current.skills?.length ?? 0) - (prior.skills?.length ?? 0));
  const baseline = Math.max(prior.skills?.length ?? 1, 1);
  if (delta / baseline > 0.1) {
    fail(`skill count changed by ${delta} of ${baseline}, more than 10%; refusing to shrink or grow silently`);
  }
  if (added.length > 0) notes.push(`upstream added ${added.length} skill(s): ${added.join(", ")}`);
  if (prior.upstreamVersion !== current.upstreamVersion) {
    notes.push(`upstream version ${prior.upstreamVersion} -> ${current.upstreamVersion}`);
  }
  if (prior.upstreamDigest !== current.upstreamDigest && added.length === 0 && removed.length === 0) {
    notes.push("upstream content changed without changing the skill set");
  }
}

// 6. manifest must describe what is actually on disk.
if (existsSync(MANIFEST)) {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (manifest.skillCount !== skillDirs.length) {
    fail(`manifest records ${manifest.skillCount} skills, tree has ${skillDirs.length}`);
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
} else {
  fail("extensions/dsh/skills.generated.json is missing");
}

for (const note of notes) console.log(`NOTE ${note}`);
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
      `${rules.rules.length} rewrite rules, ${rules.forbid.length} forbidden constructs at zero.` +
      (notes.length > 0 ? `\n\n${notes.map((note) => `- ${note}`).join("\n")}\n` : "\n"),
  );
}
console.log(`adaptation guard passed: ${skillDirs.length} skills, ${rules.rules.length} rules, 0 forbidden constructs.`);
console.log(`adapter: ${relative(ROOT, ADAPTER)} (${pathToFileURL(ADAPTER).href})`);