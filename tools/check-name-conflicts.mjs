#!/usr/bin/env node
/**
 * Skill-name conflict scan: do the 58 names this package ships collide with a
 * name the host already has?
 *
 * DSH merges skill providers by name, so two skills called `how` are one
 * `skill("how")` call whose result depends on provider order — exactly the kind
 * of ambiguity a mirror must not introduce. This tool is the check behind
 * EVIDENCE A4's "name conflicts: 0", so that claim is reproducible instead of
 * being a one-off shell loop someone ran once.
 *
 * Roots (a root is a directory whose children are skill directories):
 *   - ~/.dsh/skills/*
 *   - ~/.dsh/plugins/<plugin>/skills/*
 *   - ~/.dsh/profiles/<profile>/node_modules/aegis/skills/*
 * `--roots <dir>[,<dir>…]` replaces that discovery with an explicit list, so a
 * CI runner (which has no ~/.dsh) can point at fixture directories. A root that
 * does not exist is SKIPped with a printed reason — never silently dropped.
 *
 * Exit 1 when any name collides. Exit 2 on a usage error.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DSH_HOME = join(homedir(), ".dsh");

/** A root "has skills" when its children are directories that hold a SKILL.md. */
function skillsIn(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "SKILL.md")))
    .sort();
}

/** Every directory on this machine that could contribute skill names. */
export function defaultRoots(home = homedir()) {
  const dshHome = join(home, ".dsh");
  const roots = [];

  roots.push(join(dshHome, "skills"));

  const plugins = join(dshHome, "plugins");
  if (existsSync(plugins)) {
    for (const entry of readdirSync(plugins, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(plugins, entry.name, "skills"));
    }
  }

  const profiles = join(dshHome, "profiles");
  if (existsSync(profiles)) {
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "node_modules") continue;
      const profile = join(profiles, entry.name);
      // Installed third-party skill packs that land in a profile's node_modules.
      roots.push(join(profile, "node_modules", "aegis", "skills"));
    }
  }

  return [...new Set(roots)];
}

/**
 * Scans roots and returns names that appear both in `packageNames` and on disk.
 * Pure apart from reading the roots; safe to import.
 */
export function scanNameConflicts(packageNames, roots) {
  const scanned = [];
  const skipped = [];
  const hostNames = new Map(); // name -> first root that provides it
  const seenRoots = new Set();
  for (const root of roots) {
    const abs = resolve(root);
    if (seenRoots.has(abs)) continue;
    seenRoots.add(abs);
    const names = skillsIn(abs);
    if (names === null) {
      skipped.push({ root: abs, reason: "directory does not exist" });
      continue;
    }
    scanned.push({ root: abs, names });
    for (const name of names) if (!hostNames.has(name)) hostNames.set(name, abs);
  }
  const packageSet = new Set(packageNames);
  const conflicts = [...packageSet]
    .filter((name) => hostNames.has(name))
    .sort()
    .map((name) => ({ name, root: hostNames.get(name) }));
  return { scanned, skipped, hostNames, conflicts };
}

/** The 58 names this package ships, read from `<pkg>/skills/`. */
export function packageSkillNames(packageRoot) {
  const dir = join(packageRoot, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(dir, name, "SKILL.md")))
    .sort();
}

function usage(message) {
  if (message) console.error(`FAIL ${message}`);
  console.error("usage: node tools/check-name-conflicts.mjs [--package <dir>] [--roots <dir>[,<dir>…]]");
  process.exit(2);
}

function main(argv) {
  let packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  let roots;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--package") {
      packageRoot = resolve(argv[++i] ?? usage("--package needs a directory"));
    } else if (arg.startsWith("--package=")) {
      packageRoot = resolve(arg.slice("--package=".length));
    } else if (arg === "--roots") {
      roots = (argv[++i] ?? usage("--roots needs a comma-separated list")).split(",").map((entry) => resolve(entry.trim()));
    } else if (arg.startsWith("--roots=")) {
      roots = arg.slice("--roots=".length).split(",").map((entry) => resolve(entry.trim()));
    } else {
      usage(`unknown argument ${JSON.stringify(arg)}`);
    }
  }
  roots = roots ?? defaultRoots();

  const names = packageSkillNames(packageRoot);
  const { scanned, skipped, conflicts } = scanNameConflicts(names, roots);

  console.log(`package under test: ${packageRoot}`);
  console.log(`pstack skills in this package: ${names.length}`);
  console.log(`roots scanned: ${scanned.length}`);
  for (const { root, names: found } of scanned) console.log(`  SCANNED ${root} (${found.length} skills)`);
  for (const { root, reason } of skipped) console.log(`  SKIP ${root}: ${reason}`);
  const hostTotal = new Set(scanned.flatMap((entry) => entry.names)).size;
  console.log(`host skills seen: ${hostTotal}`);
  if (conflicts.length === 0) {
    console.log(`name conflicts: 0`);
    if (scanned.length === 0) {
      console.log("NOTE no host skill roots exist on this machine; the scan proved nothing here (expected on CI, not in a profile)");
    }
    return 0;
  }
  for (const { name, root } of conflicts) console.log(`FAIL name conflict ${JSON.stringify(name)} — also provided by ${root}`);
  console.log(`name conflicts: ${conflicts.length}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}