/**
 * A tiny template language so prompts can be edited as plain text:
 *   {{name}}                      the value of a variable (empty when unset)
 *   {{#if name}}…{{/if}}          included when the variable is not empty
 *   {{#if name=value}}…{{/if}}    included when the variable equals the value
 * Blocks may nest. Single braces are ordinary text, so JSON examples need no escaping.
 */

export type PromptVars = Record<string, string | undefined>;

const TOKEN = /\{\{#if ([\w]+)(?:=([\w-]+))?\}\}|\{\{\/if\}\}|\{\{([\w]+)\}\}/g;

export function renderTemplate(template: string, vars: PromptVars): string {
  const out: string[] = [];
  // Each open block records whether its content is currently visible.
  const stack: boolean[] = [];
  const visible = () => stack.every(Boolean);
  let last = 0;

  for (const m of template.matchAll(TOKEN)) {
    if (visible()) out.push(template.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;

    if (m[1]) {
      const value = vars[m[1]] ?? '';
      stack.push(m[2] !== undefined ? value === m[2] : value !== '');
    } else if (m[0] === '{{/if}}') {
      stack.pop();
    } else if (visible()) {
      out.push(vars[m[3]] ?? '');
    }
  }
  if (visible()) out.push(template.slice(last));
  return out.join('');
}

/** Names a template refers to, for the editor's "available variables" hint and warnings. */
export function usedVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(TOKEN)) {
    const name = m[1] ?? m[3];
    if (name) names.add(name);
  }
  return [...names];
}
