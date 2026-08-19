import { getEncoding } from "js-tiktoken";

const encoding = getEncoding("o200k_base");

/**
 * Token counts are estimates (spec §7.5), with a documented ±10% tolerance
 * against the client tokenizer.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return encoding.encode(text).length;
}

export interface BudgetSection {
  id: string;
  priority: number;
  text: string;
}

export interface PackedBudget {
  included: string[];
  text: string;
  estimatedTokens: number;
  truncated: boolean;
}

function normalizedBudget(value: number): number {
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY
    ? value
    : 0;
  return Math.max(0, Math.floor(value));
}

/** Greedy priority packing; priority zero is reserved and never omitted. */
export function packToBudget(
  sections: BudgetSection[],
  budgetTokens: number,
): PackedBudget {
  const ordered = sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) =>
      left.section.priority - right.section.priority ||
      left.index - right.index
    )
    .map(({ section }) => section);
  const budget = normalizedBudget(budgetTokens);
  const included: string[] = [];
  const parts: string[] = [];
  let text = "";
  let estimatedTokens = 0;
  let truncated = false;

  for (const section of ordered) {
    const candidateParts = [...parts, section.text];
    const candidateText = candidateParts.join("\n\n");
    const candidateTokens = estimateTokens(candidateText);
    if (section.priority > 0 && candidateTokens > budget) {
      truncated = true;
      continue;
    }

    included.push(section.id);
    parts.push(section.text);
    text = candidateText;
    estimatedTokens = candidateTokens;
  }

  return { included, text, estimatedTokens, truncated };
}
