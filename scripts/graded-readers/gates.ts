/** Owns the G0–G5 pipeline; an empty diagnostic list means gates passed, never French verified. */
import { metadataGate } from './gateMetadata';
import { lexicalGates } from './gateLexical';
import { verbGate } from './gateVerbs';
import { completenessGate } from './gateCompleteness';
import { tokenize, targetInventory } from './tokenize';
import type { Diagnostic, Report } from './diagnostics';
import type { GateContext } from './gateInputs';
export type { Diagnostic } from './diagnostics';
export type { GateContext } from './gateInputs';
export type { LexiconIndex } from './lexiconIndex';

export function checkDraft(raw: unknown, context: GateContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const readerId =
    raw &&
    typeof raw === 'object' &&
    'body' in raw &&
    raw.body &&
    typeof raw.body === 'object' &&
    'id' in raw.body &&
    typeof raw.body.id === 'string'
      ? raw.body.id
      : '';
  const report: Report = (gate, reason, location = {}) =>
    diagnostics.push({
      gate,
      severity: location.severity ?? 'error',
      readerId,
      targetId: location.targetId ?? 'reader',
      ordinal: location.ordinal ?? null,
      part: location.part ?? null,
      spelling: location.spelling ?? '',
      reason,
      ...(location.selected && { selected: location.selected }),
      ...(location.candidates && { candidates: location.candidates }),
    });
  const draft = metadataGate(raw, context, report);
  if (!draft) return diagnostics;
  const targets = targetInventory(draft.body);
  const tokenizations = new Map(
    targets.map((target) => [target.id, tokenize(target, { compounds: context.evidence.compounds }, draft.body.id)]),
  );
  for (const result of tokenizations.values()) diagnostics.push(...result.diagnostics);
  const selected = lexicalGates(draft, context, tokenizations, report);
  verbGate(draft, context, selected, targets, report);
  completenessGate(draft, context, tokenizations, selected, report);
  return diagnostics;
}
