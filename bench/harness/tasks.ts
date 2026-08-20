import type { BenchmarkTask, EvidenceSymbol } from "./types.js";

const FIXTURE = "tests/fixtures/repos/medium";

function symbol(
  path: string,
  qualifiedName: string,
  expectedDepth?: number,
): EvidenceSymbol {
  return {
    stableKey: `ts:${path}#${qualifiedName}`,
    qualifiedName,
    path,
    ...(expectedDepth === undefined ? {} : { expectedDepth }),
  };
}

function fileSymbol(path: string, expectedDepth?: number): EvidenceSymbol {
  // Invariant 9: file identity has an empty scope chain, never a line or path
  // duplicated after the separator.
  return {
    stableKey: `ts:${path}#`,
    qualifiedName: path,
    path,
    ...(expectedDepth === undefined ? {} : { expectedDepth }),
  };
}

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    id: "impact-notifier-signature",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "If I change the signature of Notifier.notify in " +
      "src/notifiers/notifier.ts, what breaks?",
    seeds: [{
      kind: "impact",
      symbols: ["ts:src/notifiers/notifier.ts#Notifier.notify"],
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier.notify"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier.notify"),
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier.notify"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier.notify"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier.notify"),
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch", 1),
        symbol("src/index.ts", "start", 2),
        symbol("src/index.ts", "run", 3),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/scheduler/queue.ts", "TaskQueue.enqueue"),
      ],
      maxContextBudgetTokens: 4000,
    },
    rationale:
      "Depth-2 fan-out from an interface method to five implementers plus " +
      "its caller, selected to test transitive breadth without relying on " +
      "same-name grep results.",
  },
  {
    id: "impact-queue-enqueue",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt: "What depends on TaskQueue.enqueue in src/scheduler/queue.ts?",
    seeds: [{
      kind: "impact",
      symbols: ["ts:src/scheduler/queue.ts#TaskQueue.enqueue"],
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch", 1),
        symbol("src/index.ts", "start", 2),
        symbol("src/index.ts", "run", 3),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/reports/dailyDigest.ts", "summarizeActivity"),
      ],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "A direct caller with one further transitive hop provides the category's " +
      "simple depth-2 floor.",
  },
  {
    id: "impact-dispatch-two-hop",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "What is the full blast radius of Dispatcher.dispatch changing behavior?",
    seeds: [{
      kind: "impact",
      symbols: ["ts:src/scheduler/dispatcher.ts#Dispatcher.dispatch"],
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/index.ts", "start", 1),
        symbol("src/index.ts", "run", 2),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/reports/dailyDigest.ts", "summarizeActivity"),
      ],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Starts mid-chain and walks upward, checking the reverse direction of " +
      "the queue impact task.",
  },
  {
    id: "impact-retry-policy",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "What is the full transitive impact of changing nextDelay in " +
      "src/scheduler/retryPolicy.ts? Include production callers and tests.",
    seeds: [{
      kind: "impact",
      symbols: ["ts:src/scheduler/retryPolicy.ts#nextDelay"],
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/retryScheduler.ts", "scheduleRetry", 1),
        fileSymbol("src/scheduler/retryPolicy.test.ts", 1),
        symbol("src/scheduler/failureHandler.ts", "handleFailure", 2),
        symbol("src/index.ts", "retryFailed", 3),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
      ],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "A three-level production call chain plus a direct test caller exercises " +
      "transitive completeness without relying on an unscorable empty result.",
  },
  {
    id: "implementations-of-notifier",
    category: "wide_interface",
    fixture: FIXTURE,
    prompt: "List every class that implements the Notifier interface.",
    seeds: [{
      kind: "traverse",
      pattern: "implementations_of",
      symbol: "ts:src/notifiers/notifier.ts#Notifier",
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier"),
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Five implementers across five files with no shared class-name prefix " +
      "exercise the wide-interface category directly.",
  },
  {
    id: "implementations-of-notifier-completeness",
    category: "wide_interface",
    fixture: FIXTURE,
    prompt:
      "I found EmailNotifier and SlackNotifier implement Notifier. Are there " +
      "others I'm missing?",
    seeds: [{
      kind: "traverse",
      pattern: "implementations_of",
      symbol: "ts:src/notifiers/notifier.ts#Notifier",
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier"),
      ],
      helpfulEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier"),
      ],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Frames the same wide interface as missing-evidence recovery so partial " +
      "knowledge cannot mask incomplete retrieval.",
  },
  {
    id: "completeness-queue-callers",
    category: "completeness",
    fixture: FIXTURE,
    prompt:
      "Every place in this codebase that reads from or writes to the task " +
      "queue — I need the full list, not just the obvious ones.",
    seeds: [
      {
        kind: "traverse",
        pattern: "callers_of",
        symbol: "ts:src/scheduler/queue.ts#TaskQueue.enqueue",
      },
      {
        kind: "traverse",
        pattern: "callers_of",
        symbol: "ts:src/scheduler/queue.ts#TaskQueue.pending",
      },
    ],
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
        symbol("src/reports/dailyDigest.ts", "summarizeActivity"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "An explicit completeness claim separates the enqueue writer from the " +
      "real but differently-seeded pending reader.",
  },
  {
    id: "completeness-notifier-references",
    category: "completeness",
    fixture: FIXTURE,
    prompt:
      "What references the Notifier type, directly or as an array element?",
    seeds: [{
      kind: "traverse",
      pattern: "references_to",
      symbol: "ts:src/notifiers/notifier.ts#Notifier",
    }],
    groundTruth: {
      requiredEvidence: [
        fileSymbol("src/index.ts"),
        symbol("src/scheduler/dispatcher.ts", "Dispatcher"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Type-position references and array element types are a known weak spot " +
      "for call-site-only searches.",
  },
  {
    id: "tests-for-dispatcher-change",
    category: "test_selection",
    fixture: FIXTURE,
    prompt:
      "I'm about to change Dispatcher.dispatch — which tests should I run?",
    seeds: [{ kind: "find", query: "dispatcher" }],
    groundTruth: {
      requiredEvidence: [
        fileSymbol("src/scheduler/dispatcher.test.ts"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/scheduler/retryPolicy.test.ts")],
      maxContextBudgetTokens: 1500,
    },
    rationale:
      "TESTS edges remain deferred, so file-symbol name retrieval measures " +
      "the capability v0.1 actually exposes.",
  },
  {
    id: "tests-for-retry-policy-change",
    category: "test_selection",
    fixture: FIXTURE,
    prompt: "I'm changing nextDelay — which test file should I run?",
    seeds: [{ kind: "find", query: "retryPolicy" }],
    groundTruth: {
      requiredEvidence: [
        fileSymbol("src/scheduler/retryPolicy.test.ts"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/scheduler/dispatcher.test.ts")],
      maxContextBudgetTokens: 1500,
    },
    rationale:
      "Pairs a second target with the same file-symbol retrieval method so " +
      "returning every test file cannot look systematically successful.",
  },
  {
    id: "semantic-backoff-behavior",
    category: "semantic_disadvantage",
    fixture: FIXTURE,
    prompt:
      "Find the function that decides how long to wait before retrying a " +
      "failed notification.",
    seeds: [{
      kind: "find",
      query: "wait before retrying a failed notification",
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/retryPolicy.ts", "nextDelay"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "A behavioral description with little identifier overlap measures the " +
      "documented disadvantage of lexical+structural retrieval.",
  },
  {
    id: "semantic-alerting-synonym",
    category: "semantic_disadvantage",
    fixture: FIXTURE,
    prompt: "Where does this codebase implement alerting for task events?",
    seeds: [{ kind: "find", query: "alerting" }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/notifier.ts", "Notifier"),
      ],
      helpfulEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
      ],
      distractors: [],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "A synonym-only query (alerting versus notify) is the second explicit " +
      "semantic-search control required by the benchmark design.",
  },
];
