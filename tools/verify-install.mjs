#!/usr/bin/env node
/**
 * Offline install smoke test for pstack-dsh: `pnpm add` succeeding proves almost
 * nothing, because DSH still has to resolve the bundle patch, import the patch
 * target, and find a well-formed skills/ tree — failures that surface only after
 * a profile restart. No network, no DSH process.
 *
 * Usage: node tools/verify-install.mjs [path-to-package-root]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PKG = "pstack-dsh";
const PATCH_TARGET = `${PKG}/extensions/dsh/index.js`;
const EXPECTED_SKILLS = 58;

let passed = 0, skipped = 0, failed = 0;
function pass(label, detail) { passed++; console.log(`PASS  ${label}${detail ? ` (${detail})` : ""}`); }
function fail(label, reason) { failed++; console.log(`FAIL  ${label}: ${reason}`); }
function skip(label, reason) { skipped++; console.log(`SKIP  ${label}: ${reason}`); }

// Hand-rolled: four scalar keys per file, so the `yaml` dependency is not worth it.
function frontmatter(text) {
  const end = /^---\r?\n/.test(text) ? text.indexOf("\n---", 3) : -1;
  if (end === -1) return null;
  return Object.fromEntries(text.slice(3, end).split(/\r?\n/)
    .map((l) => /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(l))
    .filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "").trim()]));
}

async function main() {
  let root, via = "argv[2]";
  if (process.argv[2]) {
    root = resolve(process.argv[2]);
  } else {
    try {
      root = dirname(createRequire(join(process.cwd(), "resolve.cjs")).resolve(`${PKG}/package.json`));
      via = `node resolution from ${process.cwd()}`;
    } catch (err) {
      // Self-resolution by name needs an `exports` field, which this package must
      // not have, so running inside the source checkout lands here.
      const reason = err.message.split("\n")[0];
      let ownName = null;
      try { ownName = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).name; } catch { /* not ours */ }
      console.log(`package under test: unresolved\nvia: ${reason}\n`);
      if (ownName !== PKG) return fail(`resolves as "${PKG}" from the working directory`, reason);
      root = process.cwd();
      via = "current directory (source checkout, not an installed copy)";
      skip(`resolves as "${PKG}" from the working directory`, "not installed here; checked the checkout itself");
    }
  }
  console.log(`package under test: ${root}\nvia: ${via}\n`);

  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return fail("package.json exists", `${pkgPath} is missing`);
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch (err) { return fail("package.json parses", err.message); }
  pass("package.json exists and parses");
  pkg.name === PKG ? pass(`name is "${PKG}"`) : fail(`name is "${PKG}"`, `found ${JSON.stringify(pkg.name)}`);
  pkg.private === true ? pass("private is true") : fail("private is true", `found ${JSON.stringify(pkg.private)}`);
  // An `exports` map would fence off `extensions/...` and make the bare-specifier
  // patch name unresolvable by Node, so the absence of the field is load-bearing.
  pkg.exports === undefined ? pass("no exports field (deep paths stay importable)")
    : fail("no exports field (deep paths stay importable)", `found ${JSON.stringify(pkg.exports)}`);
  const patchRel = pkg.dsh?.bundle?.patch;
  patchRel ? pass("dsh.bundle.patch is declared", patchRel) : fail("dsh.bundle.patch is declared", "no dsh.bundle.patch");
  if (!patchRel) return;
  const patchPath = join(root, patchRel);
  if (!existsSync(patchPath)) return fail("dsh.bundle.patch file exists", `${patchRel} is missing`);
  const patchText = readFileSync(patchPath, "utf8");
  const problems = [];
  if (!/^- insert:/m.test(patchText)) problems.push("no `- insert:` entry");
  if (!patchText.split(/\r?\n/).some((l) => /^\s*name:/.test(l) && l.includes(PATCH_TARGET))) problems.push(`no name: ${PATCH_TARGET}`);
  problems.length ? fail("dsh.bundle.patch parses as a bundle patch", problems.join("; "))
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
    bad.length ? fail(importLabel, bad.join("; ")) : pass(importLabel, `inject=${JSON.stringify(mod.inject)}`);
  } catch (err) {
    const reason = String(err?.message ?? err).split("\n")[0];
    err?.code === "ERR_MODULE_NOT_FOUND"
      ? skip(importLabel, `peer dependency not present here, expected outside DSH — ${reason}`)
      : fail(importLabel, reason);
  }
  const skillsDir = join(root, "skills");
  const dirs = existsSync(skillsDir) && statSync(skillsDir).isDirectory()
    ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : null;
  if (!dirs) fail("skills/ exists", "no generated skills tree (run tools/adapt.mjs)");
  else if (dirs.length !== EXPECTED_SKILLS) fail(`skills/ holds ${EXPECTED_SKILLS} skill directories`, `found ${dirs.length}`);
  else pass(`skills/ holds ${EXPECTED_SKILLS} skill directories`);
  if (dirs) {
    const missing = dirs.filter((n) => !existsSync(join(skillsDir, n, "SKILL.md")));
    missing.length ? fail("every skill directory has SKILL.md", missing.join(", ")) : pass("every skill directory has SKILL.md");
    const bad = [], seen = [];
    for (const dir of dirs) {
      const file = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(file)) continue;
      const fm = frontmatter(readFileSync(file, "utf8"));
      if (!fm || !fm.name) { bad.push(`${dir}: unparseable or nameless frontmatter`); continue; }
      seen.push(fm.name);
      if (fm.name !== dir) bad.push(`${dir}: name is "${fm.name}"`);
    }
    bad.length ? fail("frontmatter parses and name matches its directory", `${bad.slice(0, 5).join("; ")}${bad.length > 5 ? ` (+${bad.length - 5} more)` : ""}`)
      : pass("frontmatter parses and name matches its directory", `${seen.length} files`);
    const dupes = [...new Set(seen.filter((n, i) => seen.indexOf(n) !== i))];
    dupes.length ? fail("no duplicate skill names", dupes.join(", ")) : pass("no duplicate skill names");
  }
  const piSkills = pkg.pi?.skills;
  if (!Array.isArray(piSkills) || piSkills.length === 0) return fail("pi.skills is declared", "no pi.skills array");
  const gone = piSkills.filter((p) => !existsSync(resolve(root, p)));
  gone.length ? fail("pi.skills paths exist", gone.join(", ")) : pass("pi.skills paths exist", piSkills.join(", "));
}

await main().catch((err) => fail("verifier ran to completion", String(err?.stack ?? err).split("\n")[0]));
console.log(`\nverify-install: ${passed} passed, ${skipped} skipped, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;