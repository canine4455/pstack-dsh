#!/usr/bin/env node
/**
 * Offline install smoke test for pstack-dsh: `pnpm add` succeeding proves almost
 * nothing, because DSH still has to resolve the bundle patch, import the patch
 * target, and find a well-formed skills/ tree — failures that surface only after
 * a profile restart. No network, no DSH process.
 *
 * Usage: node tools/verify-install.mjs [--strict] [path-to-package-root]
 *
 * `--strict` exists because a check that is skipped is a check that did not run,
 * and "1 skipped, 0 failed" is exactly how a dead copy of this package passes.
 * Under `--strict` the *only* tolerated skip is the whitelisted one below; every
 * other skip is turned into a failure at the end of the run.
 *
 * Whitelist (one entry, and here is why it is legitimate):
 *   id: peer-import
 *   The patch target imports `@deepseek-ai/dsh-skill-filesystem`, which is an
 *   *optional* peer (package.json `peerDependenciesMeta`), provided by DSH itself
 *   and absent by construction outside a DSH profile. The check therefore cannot
 *   run in a bare consumer project or on a CI runner, and skipping it there says
 *   nothing about the package. Inside a profile it runs for real. Anything else
 *   that would skip — a missing skills/ tree, an unreadable manifest, a package
 *   under test that cannot be identified — is a defect and must fail.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXPECTED_SKILLS, skillCountHint } from "./expected.mjs";
import { defaultRoots, packageSkillNames, scanNameConflicts } from "./check-name-conflicts.mjs";

const PKG = "pstack-dsh";
const PATCH_TARGET = `${PKG}/extensions/dsh/index.js`;
const WHITELISTED_SKIPS = new Set(["peer-import"]);

const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
const rootArg = argv.find((arg) => !arg.startsWith("--"));

let passed = 0;
let skipped = 0;
let failed = 0;
const skippedIds = [];
function pass(label, detail) {
  passed++;
  console.log(`PASS  ${label}${detail ? ` (${detail})` : ""}`);
}
function fail(label, reason) {
  failed++;
  console.log(`FAIL  ${label}: ${reason}`);
}
function skip(id, label, reason) {
  skipped++;
  skippedIds.push(id);
  console.log(`SKIP  ${label}: ${reason}`);
}

// Hand-rolled: four scalar keys per file, so the `yaml` dependency is not worth it.
function frontmatter(text) {
  const end = /^---\r?\n/.test(text) ? text.indexOf("\n---", 3) : -1;
  if (end === -1) return null;
  return Object.fromEntries(
    text
      .slice(3, end)
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "").trim()]),
  );
}

async function main() {
  let root;
  let via;
  if (rootArg) {
    root = resolve(rootArg);
    via = "argv";
  } else {
    try {
      root = dirname(createRequire(join(process.cwd(), "resolve.cjs")).resolve(`${PKG}/package.json`));
      via = `node resolution from ${process.cwd()}`;
    } catch (err) {
      // Self-resolution by name needs an `exports` field, which this package must
      // not have, so running inside the source checkout lands here. That is not a
      // skipped check: "which copy am I testing" is answered by the directory.
      const reason = String(err?.message ?? err).split("\n")[0];
      let ownName = null;
      try {
        ownName = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).name;
      } catch {
        /* not ours */
      }
      if (ownName !== PKG) return fail("package under test is identifiable", reason);
      pass("package under test is identified", "source checkout, not an installed copy");
      root = process.cwd();
      via = "current directory (source checkout, not an installed copy)";
    }
  }
  console.log(`package under test: ${root}\nvia: ${via}`);
  if (STRICT) console.log(`mode: --strict (only the whitelisted skip ${JSON.stringify([...WHITELISTED_SKIPS])} is tolerated)\n`);
  else console.log("");

  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return fail("package.json exists", `${pkgPath} is missing`);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (err) {
    return fail("package.json parses", err.message);
  }
  pass("package.json exists and parses");
  pkg.name === PKG ? pass(`name is "${PKG}"`) : fail(`name is "${PKG}"`, `found ${JSON.stringify(pkg.name)}`);
  pkg.private === true ? pass("private is true") : fail("private is true", `found ${JSON.stringify(pkg.private)}`);
  // An `exports` map would fence off `extensions/...` and make the bare-specifier
  // patch name unresolvable by Node, so the absence of the field is load-bearing.
  pkg.exports === undefined
    ? pass("no exports field (deep paths stay importable)")
    : fail("no exports field (deep paths stay importable)", `found ${JSON.stringify(pkg.exports)}`);

  const patchRel = pkg.dsh?.bundle?.patch;
  patchRel ? pass("dsh.bundle.patch is declared", patchRel) : fail("dsh.bundle.patch is declared", "no dsh.bundle.patch");
  if (!patchRel) return;
  const patchPath = join(root, patchRel);
  if (!existsSync(patchPath)) return fail("dsh.bundle.patch file exists", `${patchRel} is missing`);
  const patchText = readFileSync(patchPath, "utf8");
  const problems = [];
  if (!/^- insert:/m.test(patchText)) problems.push("no `- insert:` entry");
  if (!patchText.split(/\r?\n/).some((line) => /^\s*name:/.test(line) && line.includes(PATCH_TARGET))) {
    problems.push(`no name: ${PATCH_TARGET}`);
  }
  problems.length > 0
    ? fail("dsh.bundle.patch parses as a bundle patch", problems.join("; "))
    : pass("dsh.bundle.patch parses as a bundle patch", `inserts ${PATCH_TARGET}`);

  const targetPath = join(root, "extensions", "dsh", "index.js");
  if (!existsSync(targetPath)) return fail("patch target exists", "extensions/dsh/index.js is missing");
  pass("patch target exists", "extensions/dsh/index.js");
  const importLabel = 'patch target imports for real and exports apply() + inject ["skills"]';
  try {
    const mod = await import(pathToFileURL(targetPath).href);
    const bad = [];
    if (typeof mod.apply !== "function") bad.push("no exported function `apply`");
    if (!Array.isArray(mod.inject) || !mod.inject.includes("skills")) bad.push(`inject is ${JSON.stringify(mod.inject)}`);
    bad.length > 0 ? fail(importLabel, bad.join("; ")) : pass(importLabel, `inject=${JSON.stringify(mod.inject)}`);
  } catch (err) {
    const reason = String(err?.message ?? err).split("\n")[0];
    if (err?.code === "ERR_MODULE_NOT_FOUND" && /@deepseek-ai\//.test(reason)) {
      skip("peer-import", importLabel, `optional DSH peer absent outside a profile (whitelisted) — ${reason}`);
    } else {
      fail(importLabel, reason);
    }
  }

  const skillsDir = join(root, "skills");
  const dirs =
    existsSync(skillsDir) && statSync(skillsDir).isDirectory()
      ? readdirSync(skillsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : null;
  if (!dirs) fail("skills/ exists", "no generated skills tree (run tools/adapt.mjs)");
  else if (dirs.length !== EXPECTED_SKILLS) fail(`skills/ holds ${EXPECTED_SKILLS} skill directories`, skillCountHint(dirs.length));
  else pass(`skills/ holds ${EXPECTED_SKILLS} skill directories`);
  if (dirs) {
    const missing = dirs.filter((name) => !existsSync(join(skillsDir, name, "SKILL.md")));
    missing.length > 0 ? fail("every skill directory has SKILL.md", missing.join(", ")) : pass("every skill directory has SKILL.md");
    const bad = [];
    const seen = [];
    for (const dir of dirs) {
      const file = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(file)) continue;
      const fm = frontmatter(readFileSync(file, "utf8"));
      if (!fm || !fm.name) {
        bad.push(`${dir}: unparseable or nameless frontmatter`);
        continue;
      }
      seen.push(fm.name);
      if (fm.name !== dir) bad.push(`${dir}: name is "${fm.name}"`);
    }
    bad.length > 0
      ? fail("frontmatter parses and name matches its directory", `${bad.slice(0, 5).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ""}`)
      : pass("frontmatter parses and name matches its directory", `${seen.length} files`);
    const dupes = [...new Set(seen.filter((name, index) => seen.indexOf(name) !== index))];
    dupes.length > 0 ? fail("no duplicate skill names", dupes.join(", ")) : pass("no duplicate skill names");
  }

  // Name conflicts: a same-named skill elsewhere on the host makes one
  // `skill("name")` call ambiguous. See tools/check-name-conflicts.mjs (EVIDENCE A4).
  {
    const names = packageSkillNames(root);
    const { scanned, skipped: missingRoots, conflicts } = scanNameConflicts(names, defaultRoots());
    const hostSkills = new Set(scanned.flatMap((entry) => entry.names)).size;
    const detail = `${scanned.length} root(s), ${hostSkills} host skills, ${missingRoots.length} root(s) absent`;
    if (conflicts.length > 0) {
      fail("no skill name collides with a host skill root", conflicts.map(({ name, root: where }) => `${name} (also in ${where})`).join("; "));
    } else if (scanned.length === 0) {
      pass("no skill name collides with a host skill root", `${detail} — nothing to collide with on this machine`);
    } else {
      pass("no skill name collides with a host skill root", detail);
    }
  }

  const piSkills = pkg.pi?.skills;
  if (!Array.isArray(piSkills) || piSkills.length === 0) return fail("pi.skills is declared", "no pi.skills array");
  const gone = piSkills.filter((path) => !existsSync(resolve(root, path)));
  gone.length > 0 ? fail("pi.skills paths exist", gone.join(", ")) : pass("pi.skills paths exist", piSkills.join(", "));
}

await main().catch((err) => fail("verifier ran to completion", String(err?.stack ?? err).split("\n")[0]));

const unwhitelisted = skippedIds.filter((id) => !WHITELISTED_SKIPS.has(id));
console.log(`\nverify-install: ${passed} passed, ${skipped} skipped, ${failed} failed`);
if (STRICT && unwhitelisted.length > 0) {
  console.log(`FAIL  --strict: ${unwhitelisted.length} skip(s) outside the whitelist ${JSON.stringify([...WHITELISTED_SKIPS])}: ${unwhitelisted.join(", ")}`);
  failed += unwhitelisted.length;
} else if (STRICT) {
  console.log(`strict: every skip is on the whitelist ${JSON.stringify([...WHITELISTED_SKIPS])}`);
}
process.exitCode = failed === 0 ? 0 : 1;