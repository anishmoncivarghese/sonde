import { z } from "zod";

const symbolKind = z.enum([
  "file",
  "module",
  "class",
  "interface",
  "type",
  "enum",
  "function",
  "method",
  "property",
  "variable",
  "test",
]);

export const findSymbolsSchema = {
  query: z.string().min(1).describe("Symbol name, path fragment, or free text"),
  kinds: z.array(symbolKind).optional(),
  paths: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
};

export const queryGraphSchema = {
  pattern: z.enum([
    "callers_of",
    "callees_of",
    "references_to",
    "imports_of",
    "imported_by",
    "implementations_of",
    "inheritors_of",
    "inherits_from",
    "tests_for",
    "contained_by",
    "contains",
  ]),
  symbol: z.string().min(1).describe(
    "stable_key, qualified name, or short name",
  ),
  limit: z.number().int().positive().optional(),
};

export const getImpactRadiusSchema = {
  symbols: z.array(z.string().min(1)).optional(),
  from_git_diff: z.boolean().optional(),
  token_budget: z.number().int().positive().optional(),
};
