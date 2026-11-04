#!/usr/bin/env node
/**
 * Regenerates the shipped pstack tree for DeepSeek Harness.
 *
 *   vendor/pstack/  (upstream, verbatim, written only by the sync workflow)
 *     ->  skills/                              58 skill directories
 *     ->  agents/                              2 agent briefs
 *     ->  extensions/dsh/skills.generated.json manifest
 *
 * The only difference between an upstream markdown file and its shipped copy is
 * what the machine-readable rule table in harness/dsh.md says, plus one pointer
 * line under the H1 of a SKILL.md that still carries a mapped name. Everything
 * else is copied byte for byte, so `--check` and tools/check-adaptation.mjs can
 * prove the mirror never invents prose.
 *
 * Deterministic and idempotent: same vendor in, byte-identical tree out.
 * Run with --check to report drift instead of writing.
 */

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "pstack");
const SOURCES = [
  ["skills", join(VENDOR, "skills"), join(ROOT, "skills")],
  ["agents", join(VENDOR, "agents"), join(ROOT, "agents")],
];
const ADAPTER = join(ROOT, "harness", "dsh.md");
const MANIFEST = join(ROOT, "extensions", "dsh", "skills.generated.json");
const PACKAGE = join(ROOT, "package.json");
const CHECK = process.argv.includes("--check");
const MARK_START = "<!-- adapt-rules:start -->";
const MARK_END = "<!-- adapt-rules:end -->";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The rule table lives in harness/dsh.md so the mapping a human reads and the
 *  rewrite a machine runs cannot drift apart. */
function readRules() {
  const markdown = readFileSync(ADAPTER, "utf8");
  const start = markdown.indexOf(MARK_START);
  const end = markdown.indexOf(MARK_END);
  if (start < 0 || end < 0 || end < start) {
    fail(`${relative(ROOT, ADAPTER)} has no machine-readable rule block`);
    return undefined;
  }
  const fenced = markdown.slice(start + MARK_START.length, end);
  const json = fenced.replace(/^[\s\S]*?```json\r?\n/, "").replace(/```[\s\S]*$/, "");
  return JSON.parse(json);
}

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      if (name === ".DS_Store") return [];
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function rewrite(text, rules, tally) {
  let out = text;
  for (const rule of rules) {
    const before = out;
    if (rule.exact) out = out.split(rule.find).join(rule.replace);
    else out = out.replace(new RegExp(rule.find, rule.flags ?? "g"), rule.replace);
    if (out !== before) tally.set(rule.id, (tally.get(rule.id) ?? 0) + 1);
  }
  return out;
}

/** Upstream wraps each SKILL.md that names Cursor constructs by pointing at an
 *  adapter doc; the pointer is the whole reason a body can stay upstream's. */
function withPointer(text, pointer, matched) {
  if (!matched) return text;
  if (text.includes(pointer)) return text;
  return text.replace(/^(# .*)\n+/m, `$1\n\n${pointer}\n\n`);
}

function build(rules) {
  const tally = new Map();
  const normalised = new Set();
  const files = new Map();
  for (const [, sourceDir, outDir] of SOURCES) {
    if (!existsSync(sourceDir)) {
      fail(`missing upstream source ${relative(ROOT, sourceDir)}`);
      continue;
    }
    for (const path of walk(sourceDir)) {
      const rel = relative(sourceDir, path);
      const bytes = readFileSync(path);
      const isSkillFile = rel.endsWith("SKILL.md");
      let out = bytes;
      if (rel.endsWith(".md")) {
        // Canonicalise line endings so a Windows checkout and the Linux runner
        // produce identical bytes. Upstream is LF; tools/check-adaptation.mjs
        // fails loudly if that ever stops being true.
        const raw = bytes.toString("utf8");
        const text = raw.replace(/\r\n/g, "\n");
        if (text !== raw) normalised.add(rel);
        const matched = new RegExp(rules.pointerWhen).test(text);
        out = Buffer.from(withPointer(rewrite(text, rules.rules, tally), rules.pointer, matched && isSkillFile));
      }
      files.set(join(outDir, rel), out);
    }
  }
  return { files, tally, normalised };
}

function manifestFor(files, rules) {
  const skillsRoot = join(ROOT, "skills");
  const entries = [...files.entries()]
    .filter(([path]) => dirname(path) === skillsRoot || path.startsWith(`${skillsRoot}/`))
    .map(([path]) => path);
  const names = readdirSync(join(VENDOR, "skills"))
    .filter((name) => existsSync(join(VENDOR, "skills", name, "SKILL.md")))
    .sort();
  const vendorDigest = sha256(
    Buffer.from(
      walk(VENDOR)
        // POSIX separators on every platform, or the digest differs between a
        // Windows checkout and the Linux runner for identical content.
        .map((path) => `${relative(VENDOR, path).replace(/\\/g, "/")}:${sha256(readFileSync(path))}`)
        .join("\n"),
    ),
  );
  return {
    generator: "tools/adapt.mjs",
    adapter: "harness/dsh.md",
    note: "Generated. Do not edit skills/ or agents/ by hand; run tools/adapt.mjs.",
    upstreamVersion: JSON.parse(readFileSync(join(VENDOR, "plugin.json"), "utf8")).version,
    upstreamDigest: vendorDigest,
    skillCount: names.length,
    skills: names.map((name) => ({
      name,
      sha256: sha256(files.get(join(skillsRoot, name, "SKILL.md"))),
    })),
    ruleIds: rules.rules.map((rule) => rule.id),
  };
}

function syncPackageVersion(version) {
  const text = readFileSync(PACKAGE, "utf8");
  const pattern = /("version":\s*")([^"]+)(")/g;
  const found = [...text.matchAll(pattern)];
  if (found.length !== 1) {
    fail(`package.json must have exactly one version field, found ${found.length}`);
    return undefined;
  }
  return text.replace(pattern, `$1${version}$3`);
}

const rules = readRules();
if (!rules) process.exit(1);
if (!existsSync(join(VENDOR, "plugin.json"))) {
  fail("missing vendor/pstack/plugin.json");
  process.exit(1);
}

const { files, tally, normalised } = build(rules);
const manifest = manifestFor(files, rules);
const packageText = syncPackageVersion(manifest.upstreamVersion);

if (CHECK) {
  const drifted = [...files.entries()].filter(
    ([path, bytes]) => !existsSync(path) || !readFileSync(path).equals(bytes),
  );
  const manifestDrift = !existsSync(MANIFEST) || !readFileSync(MANIFEST, "utf8").includes(`"upstreamDigest": "${manifest.upstreamDigest}"`);
  for (const [path] of drifted.slice(0, 20)) console.log(relative(ROOT, path));
  if (drifted.length > 0 || manifestDrift) {
    console.log(`pstack-dsh is out of date. Run \`node tools/adapt.mjs\` and commit the result.`);
    process.exit(1);
  }
  console.log(`pstack-dsh is up to date (${manifest.skillCount} skills, ${files.size} files).`);
} else {
  for (const outDir of [join(ROOT, "skills"), join(ROOT, "agents")]) {
    rmSync(outDir, { recursive: true, force: true });
  }
  for (const [path, bytes] of files) {
    mkdirSync(dirname(path), { recursive: true });
    // Fixed mode: the mirror must not churn the executable bit between a
    // Windows checkout, which has none, and the Linux runner, which does.
    writeFileSync(path, bytes, { mode: 0o644 });
    chmodSync(path, 0o644);
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (packageText !== undefined) writeFileSync(PACKAGE, packageText);
  const silent = rules.rules.filter((rule) => !tally.has(rule.id));
  const rewrites = [...tally.values()].reduce((sum, count) => sum + count, 0);
  console.log(
    `${manifest.skillCount} skills, ${files.size} files, ${rewrites} rewrites across ${tally.size} rules, upstream ${manifest.upstreamVersion}.`,
  );
  if (silent.length > 0) {
    console.log(`note: ${silent.length} rule(s) matched nothing upstream: ${silent.map((rule) => rule.id).join(", ")}`);
  }
  if (normalised.size > 0) {
    console.log(`note: normalised CRLF to LF in ${normalised.size} upstream file(s)`);
  }
}