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
 * what the machine-readable rule table in harness/dsh.md says — executed by
 * tools/rules.mjs, which tools/check-adaptation.mjs imports as well — plus one
 * pointer line under the H1 of a SKILL.md that still carries a mapped name.
 * Everything else is copied byte for byte, so `--check` and the guard can prove
 * the mirror never invents prose.
 *
 * Deterministic and idempotent: same vendor in, byte-identical tree out.
 * Run with --check to report drift instead of writing.
 *
 * Failure policy: every check runs *before* the first byte is written. A missing
 * source tree, an unreadable rule table, an unexpected skill count, or a
 * package.json that cannot be versioned exits non-zero and leaves the existing
 * tree untouched — a half-written mirror is worse than none, because the next
 * run would treat the wreckage as its baseline.
 */
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_SKILLS, skillCountHint } from "./expected.mjs";
import { adaptMarkdown, readAdapterRules } from "./rules.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const VENDOR = join(ROOT, "vendor", "pstack");
const SOURCES = [
  ["skills", join(VENDOR, "skills"), join(ROOT, "skills")],
  ["agents", join(VENDOR, "agents"), join(ROOT, "agents")],
];
const ADAPTER = join(ROOT, "harness", "dsh.md");
const MANIFEST = join(ROOT, "extensions", "dsh", "skills.generated.json");
const PACKAGE = join(ROOT, "package.json");
const CHECK = process.argv.includes("--check");
const ALLOW_NESTED = process.argv.includes("--allow-nested");

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

function walkDirs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      acc.push(path);
      walkDirs(path, acc);
    }
  }
  return acc;
}

/**
 * Running this inside an installed copy would delete the payload it is standing
 * on: `skills/` and `agents/` under node_modules are the package's shipped tree,
 * and the prune step would treat vendor/ as the only truth. Refuse by default.
 */
if (/[\\/]node_modules[\\/]/.test(SELF)) {
  if (ALLOW_NESTED) {
    notes.push("regenerating inside node_modules because --allow-nested was passed");
  } else if (CHECK) {
    notes.push("inside node_modules, --check mode only (read-only; nothing is written)");
  } else {
    fail("refusing to regenerate inside node_modules: this would rewrite the installed package. Pass --allow-nested if that is really intended.");
  }
}

let rules;
try {
  rules = readAdapterRules(ADAPTER);
} catch (err) {
  fail(`${relative(ROOT, ADAPTER)}: ${err.message}`);
}

for (const [label, sourceDir] of SOURCES) {
  if (!existsSync(sourceDir)) fail(`missing upstream source vendor/pstack/${label}/ — upstream layout changed`);
}
if (!existsSync(join(VENDOR, "plugin.json"))) fail("missing vendor/pstack/plugin.json — upstream layout changed");

/** Reads and transforms everything in memory. Nothing touches the disk here. */
function build() {
  const tally = new Map();
  const normalisedFiles = [];
  const files = new Map();
  let pointerFiles = 0;
  for (const [label, sourceDir, outDir] of SOURCES) {
    if (!existsSync(sourceDir)) continue;
    for (const path of walk(sourceDir)) {
      const rel = relative(sourceDir, path).replace(/\\/g, "/");
      const relFromRoot = `${label}/${rel}`;
      const bytes = readFileSync(path);
      if (!rel.endsWith(".md")) {
        files.set(join(outDir, rel), bytes);
        continue;
      }
      const { text, normalised, pointerAdded } = adaptMarkdown(
        bytes.toString("utf8"),
        rules,
        relFromRoot,
        rel.endsWith("SKILL.md"),
        tally,
      );
      if (normalised) normalisedFiles.push(rel);
      if (pointerAdded) pointerFiles++;
      files.set(join(outDir, rel), Buffer.from(text));
    }
  }
  return { files, tally, normalisedFiles, pointerFiles };
}

function manifestFor(files) {
  const skillsRoot = join(ROOT, "skills");
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

function packageTextFor(version) {
  const text = readFileSync(PACKAGE, "utf8");
  const pattern = /("version":\s*")([^"]+)(")/g;
  const found = [...text.matchAll(pattern)];
  if (found.length !== 1) {
    fail(`package.json must have exactly one version field, found ${found.length}`);
    return undefined;
  }
  return text.replace(pattern, `$1${version}$3`);
}

/** Writes only after every check passed, then prunes what upstream dropped. */
function writeTree(files, manifest, packageText) {
  for (const [path, bytes] of files) {
    mkdirSync(dirname(path), { recursive: true });
    // Fixed mode: the mirror must not churn the executable bit between a
    // Windows checkout, which has none, and the Linux runner, which does.
    writeFileSync(path, bytes, { mode: 0o644 });
    chmodSync(path, 0o644);
  }
  const expected = new Set(files.keys());
  for (const outDir of [join(ROOT, "skills"), join(ROOT, "agents")]) {
    for (const path of walk(outDir)) if (!expected.has(path)) rmSync(path, { force: true });
    // Deepest first, so a directory emptied by the prune above also goes away.
    for (const dir of walkDirs(outDir).reverse()) {
      try {
        if (readdirSync(dir).length === 0) rmdirSync(dir);
      } catch {
        /* not worth failing the run over */
      }
    }
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (packageText !== undefined) writeFileSync(PACKAGE, packageText);
}

function stop() {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  console.error("nothing was written; fix the above and re-run");
  process.exit(1);
}

if (problems.length > 0 || !rules) stop();

const { files, tally, normalisedFiles, pointerFiles } = build();

const vendorSkillCount = readdirSync(join(VENDOR, "skills")).filter((name) =>
  existsSync(join(VENDOR, "skills", name, "SKILL.md")),
).length;
if (vendorSkillCount !== EXPECTED_SKILLS) fail(skillCountHint(vendorSkillCount));
if (problems.length > 0) stop();

const manifest = manifestFor(files);
const packageText = packageTextFor(manifest.upstreamVersion);
if (problems.length > 0 || packageText === undefined) stop();

if (CHECK) {
  const drifted = [...files.entries()]
    .filter(([path, bytes]) => !existsSync(path) || !readFileSync(path).equals(bytes))
    .map(([path]) => relative(ROOT, path));
  const manifestDrift =
    !existsSync(MANIFEST) || !readFileSync(MANIFEST, "utf8").includes(`"upstreamDigest": "${manifest.upstreamDigest}"`);
  for (const path of drifted.slice(0, 20)) console.log(path);
  if (drifted.length > 0 || manifestDrift) {
    console.log("pstack-dsh is out of date. Run `node tools/adapt.mjs` and commit the result.");
    process.exit(1);
  }
  console.log(`pstack-dsh is up to date (${manifest.skillCount} skills, ${files.size} files).`);
} else {
  writeTree(files, manifest, packageText);
  const rewrites = [...tally.values()].reduce((sum, count) => sum + count, 0);
  console.log(
    `${manifest.skillCount} skills, ${files.size} files, ${rewrites} rewrites across ${tally.size} rules, ` +
      `${pointerFiles} pointer lines under lineEndings "${rules.lineEndings}", upstream ${manifest.upstreamVersion}.`,
  );
  const silent = rules.rules.filter((rule) => !tally.has(rule.id));
  if (silent.length > 0) {
    console.log(`note: ${silent.length} rule(s) matched nothing upstream: ${silent.map((rule) => rule.id).join(", ")}`);
  }
  if (normalisedFiles.length > 0) {
    console.log(`note: applied lineEndings "${rules.lineEndings}" to ${normalisedFiles.length} upstream file(s)`);
  }
}

for (const note of notes) console.log(`NOTE ${note}`);