/**
 * The rule table in harness/dsh.md, and the three operations that turn an
 * upstream markdown file into its shipped copy. `tools/adapt.mjs` (the only
 * writer) and `tools/check-adaptation.mjs` (the guard) both import this module,
 * so the rewrite a machine runs and the Byte audit a machine proves can no
 * longer drift apart — they are the same code.
 *
 * Everything here is pure: no filesystem reads except readAdapterRules().
 */
import { readFileSync } from "node:fs";

const MARK_START = "<!-- adapt-rules:start -->";
const MARK_END = "<!-- adapt-rules:end -->";

/** How the pointer line names the adapter doc. Substituted per file depth. */
export const ADAPTER_TOKEN = "%ADAPTER%";

/** The adapter doc, relative to the package root. */
export const ADAPTER_REL = "harness/dsh.md";

/** Line-ending policy a mirror may execute. Anything else must be refused. */
export const LINE_ENDINGS = ["crlf-to-lf", "none"];

/**
 * Reads the machine-readable block out of the adapter doc.
 * Throws with an actionable message instead of returning a partial object: a
 * generator that half-reads its own rule table is worse than one that stops.
 */
export function readAdapterRules(adapterPath) {
  const markdown = readFileSync(adapterPath, "utf8");
  const start = markdown.indexOf(MARK_START);
  const end = markdown.indexOf(MARK_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${adapterPath} has no ${MARK_START} … ${MARK_END} rule block`);
  }
  const fenced = markdown.slice(start + MARK_START.length, end);
  const json = fenced.replace(/^[\s\S]*?```json\r?\n/, "").replace(/```[\s\S]*$/, "");
  const table = JSON.parse(json);
  if (!Array.isArray(table.rules)) throw new Error(`${adapterPath}: rule block has no "rules" array`);
  if (!Array.isArray(table.forbid)) throw new Error(`${adapterPath}: rule block has no "forbid" array`);
  if (typeof table.pointer !== "string" || !table.pointer.includes(ADAPTER_TOKEN)) {
    throw new Error(`${adapterPath}: "pointer" must be a string carrying the ${ADAPTER_TOKEN} token`);
  }
  if (typeof table.pointerWhen !== "string") throw new Error(`${adapterPath}: "pointerWhen" missing`);
  const lineEndings = table.lineEndings ?? "none";
  if (!LINE_ENDINGS.includes(lineEndings)) {
    throw new Error(`${adapterPath}: "lineEndings" must be one of ${LINE_ENDINGS.join(" | ")}, found ${JSON.stringify(table.lineEndings)}`);
  }
  return { ...table, lineEndings };
}

/**
 * Applies the declared line-ending policy to one file's text.
 * Returns `changed` so the caller can report it; never silently rewrites bytes
 * the policy does not cover.
 */
export function normaliseLineEndings(text, policy) {
  if (policy !== "crlf-to-lf") return { text, changed: false };
  const next = text.replace(/\r\n/g, "\n");
  return { text: next, changed: next !== text };
}

/** Applies every rule in order. `tally` counts whole-file applications per rule id. */
export function applyRules(text, rules, tally) {
  let out = text;
  for (const rule of rules) {
    const before = out;
    if (rule.exact) out = out.split(rule.find).join(rule.replace);
    else out = out.replace(new RegExp(rule.find, rule.flags ?? "g"), rule.replace);
    if (out !== before && tally) tally.set(rule.id, (tally.get(rule.id) ?? 0) + 1);
  }
  return out;
}

/** True when a single rule would match this text (used by the byte audit). */
export function ruleMatches(rule, text) {
  return rule.exact ? text.includes(rule.find) : new RegExp(rule.find).test(text);
}

/**
 * The pointer href for a file at `relPath` (POSIX, relative to the package
 * root). Computed from the file's depth instead of hardcoded to two levels:
 * a SKILL.md that moves one directory up or down must still point at the
 * adapter doc, not at a path that happens to work today.
 */
export function pointerHref(relPath) {
  const depth = relPath.split("/").length - 1;
  return `${"../".repeat(depth)}${ADAPTER_REL}`;
}

/** The pointer line itself, with the depth-correct href substituted in. */
export function pointerLine(pointerTemplate, relPath) {
  return pointerTemplate.replaceAll(ADAPTER_TOKEN, pointerHref(relPath));
}

/**
 * Inserts the pointer line under the H1 of a SKILL.md that still names Cursor
 * constructs. Idempotent: an existing pointer is left alone.
 */
export function withPointer(text, line) {
  if (!line) return text;
  if (text.includes(line)) return text;
  return text.replace(/^(# .*)\n+/m, `$1\n\n${line}\n\n`);
}

/**
 * The full upstream → shipped transform for one markdown file, in one place.
 * `relPath` is POSIX and relative to the package root; `isSkillFile` gates the
 * pointer, because only a SKILL.md body is a body the model follows.
 */
export function adaptMarkdown(text, { rules, pointer, pointerWhen, lineEndings }, relPath, isSkillFile, tally) {
  const normalised = normaliseLineEndings(text, lineEndings);
  const rewritten = applyRules(normalised.text, rules, tally);
  const wantsPointer = isSkillFile && new RegExp(pointerWhen).test(normalised.text);
  return {
    text: wantsPointer ? withPointer(rewritten, pointerLine(pointer, relPath)) : rewritten,
    normalised: normalised.changed,
    pointerAdded: wantsPointer && !normalised.text.includes(pointerLine(pointer, relPath)),
  };
}