/**
 * Process Detection — Analyze session activity for repeatable processes
 *
 * Scans session output/history for patterns that indicate repeatable operational
 * processes, classifies them by automation potential, and generates proposed
 * operations map entries.
 *
 * Part of: auto-detect repeatable processes during Claude Code sessions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutomationPotential = 'manual' | 'automatable' | 'hybrid';

export type ProcessCategory =
  | 'ci-cd'
  | 'dependency-management'
  | 'code-generation'
  | 'testing'
  | 'deployment'
  | 'configuration'
  | 'documentation'
  | 'security'
  | 'infrastructure'
  | 'refactoring'
  | 'release'
  | 'monitoring'
  | 'data-migration'
  | 'other';

export interface ProcessProposal {
  /** Human-readable process name */
  name: string;
  /** Description of what the process does */
  description: string;
  /** How automatable the process is */
  automationPotential: AutomationPotential;
  /** Category for the operations map */
  category: ProcessCategory;
  /** Confidence score 0-1 */
  confidence: number;
  /** Pattern IDs that triggered this detection */
  matchedPatterns: string[];
  /** Suggested trigger / schedule */
  suggestedTrigger?: string;
  /** Steps involved in the process */
  steps?: string[];
}

export interface DetectionResult {
  /** Number of session entries analyzed */
  entriesAnalyzed: number;
  /** Detected process proposals */
  proposals: ProcessProposal[];
  /** Summary of findings */
  summary: string;
}

// ---------------------------------------------------------------------------
// Session entry shape (from RTDB output)
// ---------------------------------------------------------------------------

export interface SessionEntry {
  key?: string;
  timestamp?: string;
  tool_activity?: {
    tool_name?: string;
    input?: Record<string, unknown>;
    output?: string;
  };
  assistant_message?: string;
  user_message?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

interface DetectionPattern {
  id: string;
  name: string;
  description: string;
  category: ProcessCategory;
  automationPotential: AutomationPotential;
  /** Match against tool names */
  toolPatterns?: RegExp[];
  /** Match against tool input (command text, file paths, etc.) */
  inputPatterns?: RegExp[];
  /** Match against assistant/user messages */
  messagePatterns?: RegExp[];
  /** Minimum number of matching entries to trigger */
  minMatches: number;
  /** Suggested trigger for the process */
  suggestedTrigger?: string;
  /** Confidence multiplier (higher = more confident when pattern matches) */
  confidenceWeight: number;
}

const DETECTION_PATTERNS: DetectionPattern[] = [
  // CI/CD patterns
  {
    id: 'ci-workflow-update',
    name: 'CI/CD Workflow Update',
    description: 'Modifying GitHub Actions workflows or CI configuration',
    category: 'ci-cd',
    automationPotential: 'hybrid',
    inputPatterns: [
      /\.github[\\/]workflows/i,
      /\.github[\\/]actions/i,
      /ci[\s\-_]?cd/i,
      /workflow.*\.ya?ml/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'on-push-to-ci-files',
    confidenceWeight: 0.9,
  },
  // Dependency management
  {
    id: 'dependency-update',
    name: 'Dependency Update',
    description: 'Updating package dependencies, lock files, or managing versions',
    category: 'dependency-management',
    automationPotential: 'automatable',
    inputPatterns: [
      /pnpm\s+(install|update|add|remove)/i,
      /npm\s+(install|update|ci)\b/i,
      /yarn\s+(install|upgrade|add)/i,
      /package\.json/i,
      /pnpm-lock\.yaml/i,
      /package-lock\.json/i,
    ],
    messagePatterns: [
      /updat(e|ing)\s+(depend|package|version)/i,
      /bump\s+(version|dependency)/i,
    ],
    minMatches: 2,
    suggestedTrigger: 'weekly-schedule',
    confidenceWeight: 0.85,
  },
  // Testing patterns
  {
    id: 'test-suite-management',
    name: 'Test Suite Management',
    description: 'Running, fixing, or adding tests',
    category: 'testing',
    automationPotential: 'hybrid',
    inputPatterns: [
      /vitest\s+(run|watch)/i,
      /jest\b/i,
      /pnpm\s+test/i,
      /npm\s+test/i,
      /\.test\.(ts|js|tsx|jsx)/i,
      /\.spec\.(ts|js|tsx|jsx)/i,
    ],
    messagePatterns: [
      /fix(ing)?\s+test/i,
      /add(ing)?\s+test/i,
      /test\s+(fail|pass|suite|coverage)/i,
    ],
    minMatches: 2,
    suggestedTrigger: 'on-pr-open',
    confidenceWeight: 0.8,
  },
  // Deployment patterns
  {
    id: 'deployment-process',
    name: 'Deployment Process',
    description: 'Deploying services to cloud infrastructure',
    category: 'deployment',
    automationPotential: 'automatable',
    inputPatterns: [
      /gcloud\s+run\s+deploy/i,
      /docker\s+(build|push|compose)/i,
      /terraform\s+(plan|apply)/i,
      /kubectl\s+(apply|rollout)/i,
      /firebase\s+deploy/i,
    ],
    messagePatterns: [
      /deploy(ing|ed|ment)?\s+(to\s+)?(prod|stag|cloud)/i,
      /release\s+(to|build|cut)/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'on-tag-push',
    confidenceWeight: 0.9,
  },
  // Code generation / scaffolding
  {
    id: 'code-scaffolding',
    name: 'Code Scaffolding',
    description: 'Generating boilerplate code, components, or project structure',
    category: 'code-generation',
    automationPotential: 'automatable',
    toolPatterns: [/^Write$/i],
    messagePatterns: [
      /creat(e|ing)\s+(new\s+)?(component|module|service|file|class)/i,
      /scaffold/i,
      /boilerplate/i,
      /generat(e|ing)\s+(code|template)/i,
    ],
    minMatches: 3,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.7,
  },
  // Configuration changes
  {
    id: 'config-management',
    name: 'Configuration Management',
    description: 'Updating configuration files, environment variables, or feature flags',
    category: 'configuration',
    automationPotential: 'hybrid',
    inputPatterns: [
      /\.env(\.\w+)?$/i,
      /config\.(ts|js|json|ya?ml)/i,
      /tsconfig/i,
      /next\.config/i,
      /firebase\.json/i,
      /firestore\.rules/i,
    ],
    messagePatterns: [
      /config(ure|uration)?\s+(change|update|modify)/i,
      /feature\s+flag/i,
      /environment\s+variable/i,
    ],
    minMatches: 2,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.75,
  },
  // Documentation
  {
    id: 'documentation-update',
    name: 'Documentation Update',
    description: 'Updating README, docs, or inline documentation',
    category: 'documentation',
    automationPotential: 'hybrid',
    inputPatterns: [
      /README\.md/i,
      /CHANGELOG\.md/i,
      /docs\//i,
      /\.md$/i,
    ],
    messagePatterns: [
      /document(ation|ing|ed)/i,
      /update.*readme/i,
      /changelog/i,
      /add.*docs/i,
    ],
    minMatches: 2,
    suggestedTrigger: 'on-release',
    confidenceWeight: 0.7,
  },
  // Security
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Running security scans, fixing vulnerabilities, or updating security policies',
    category: 'security',
    automationPotential: 'hybrid',
    inputPatterns: [
      /npm\s+audit/i,
      /pnpm\s+audit/i,
      /snyk/i,
      /trivy/i,
      /security/i,
      /cve[\s\-]/i,
    ],
    messagePatterns: [
      /vulnerabilit(y|ies)/i,
      /security\s+(scan|audit|fix|patch)/i,
      /cve[\s\-]\d+/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'weekly-schedule',
    confidenceWeight: 0.85,
  },
  // Infrastructure
  {
    id: 'infra-management',
    name: 'Infrastructure Management',
    description: 'Managing cloud resources, Terraform, or infrastructure configuration',
    category: 'infrastructure',
    automationPotential: 'hybrid',
    inputPatterns: [
      /terraform\b/i,
      /pulumi\b/i,
      /cloudformation/i,
      /gcloud\s+(compute|storage|sql|iam)/i,
      /aws\s+(s3|ec2|iam|lambda)/i,
    ],
    messagePatterns: [
      /infrastructure/i,
      /cloud\s+resource/i,
      /iac\b/i,
      /provision(ing)?/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.85,
  },
  // Refactoring
  {
    id: 'code-refactoring',
    name: 'Code Refactoring',
    description: 'Refactoring code structure, renaming, or reorganizing modules',
    category: 'refactoring',
    automationPotential: 'hybrid',
    toolPatterns: [/^Edit$/i],
    messagePatterns: [
      /refactor(ing|ed)?/i,
      /renam(e|ing)/i,
      /reorganiz(e|ing)/i,
      /extract\s+(function|method|component)/i,
      /move\s+(file|module|function)/i,
    ],
    minMatches: 3,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.65,
  },
  // Release process
  {
    id: 'release-process',
    name: 'Release Process',
    description: 'Cutting releases, tagging versions, publishing packages',
    category: 'release',
    automationPotential: 'automatable',
    inputPatterns: [
      /git\s+tag/i,
      /npm\s+publish/i,
      /pnpm\s+publish/i,
      /vsce\s+publish/i,
      /changeset/i,
    ],
    messagePatterns: [
      /release\s+(v?\d|cut|publish|process)/i,
      /version\s+bump/i,
      /publish(ing)?\s+(to|package)/i,
      /tag\s+v?\d/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.9,
  },
  // Data migration
  {
    id: 'data-migration',
    name: 'Data Migration',
    description: 'Database migrations, data transformations, or schema changes',
    category: 'data-migration',
    automationPotential: 'hybrid',
    inputPatterns: [
      /migrat(e|ion)/i,
      /firestore.*index/i,
      /database.*rules/i,
      /schema\s+(change|update|migration)/i,
    ],
    messagePatterns: [
      /migrat(e|ing|ion)/i,
      /schema\s+(change|update)/i,
      /data\s+transform/i,
    ],
    minMatches: 1,
    suggestedTrigger: 'on-demand',
    confidenceWeight: 0.8,
  },
];

// ---------------------------------------------------------------------------
// Core detection logic
// ---------------------------------------------------------------------------

/**
 * Extract text content from a session entry for pattern matching.
 */
function extractEntryText(entry: SessionEntry): {
  toolName: string;
  inputText: string;
  messageText: string;
} {
  const toolName = entry.tool_activity?.tool_name ?? '';

  // Combine all input fields into searchable text
  const input = entry.tool_activity?.input ?? {};
  const inputParts: string[] = [];
  for (const value of Object.values(input)) {
    if (typeof value === 'string') {
      inputParts.push(value);
    }
  }
  const inputText = inputParts.join(' ');

  // Combine messages
  const messageText = [
    entry.assistant_message ?? '',
    entry.user_message ?? '',
    entry.tool_activity?.output ?? '',
  ].join(' ');

  return { toolName, inputText, messageText };
}

/**
 * Check if a session entry matches a detection pattern.
 */
function entryMatchesPattern(entry: SessionEntry, pattern: DetectionPattern): boolean {
  const { toolName, inputText, messageText } = extractEntryText(entry);

  if (pattern.toolPatterns?.length) {
    if (pattern.toolPatterns.some((p) => p.test(toolName))) return true;
  }

  if (pattern.inputPatterns?.length) {
    if (pattern.inputPatterns.some((p) => p.test(inputText))) return true;
  }

  if (pattern.messagePatterns?.length) {
    if (pattern.messagePatterns.some((p) => p.test(messageText))) return true;
  }

  return false;
}

/**
 * Infer process steps from matched entries.
 */
function inferSteps(entries: SessionEntry[], pattern: DetectionPattern): string[] {
  const steps: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const { toolName, inputText } = extractEntryText(entry);
    let stepDesc = '';

    if (toolName && inputText) {
      // Truncate long commands
      const shortInput = inputText.length > 100 ? inputText.slice(0, 100) + '...' : inputText;
      stepDesc = `${toolName}: ${shortInput}`;
    } else if (toolName) {
      stepDesc = `Use ${toolName}`;
    }

    if (stepDesc && !seen.has(stepDesc)) {
      seen.add(stepDesc);
      steps.push(stepDesc);
    }

    // Cap at 10 steps
    if (steps.length >= 10) break;
  }

  return steps;
}

/**
 * Detect repeatable processes from session activity entries.
 *
 * Analyzes a list of session output entries against known patterns,
 * counts matches, and produces structured process proposals.
 */
export function detectProcesses(entries: SessionEntry[]): DetectionResult {
  if (!entries || entries.length === 0) {
    return {
      entriesAnalyzed: 0,
      proposals: [],
      summary: 'No session entries to analyze.',
    };
  }

  const proposals: ProcessProposal[] = [];

  for (const pattern of DETECTION_PATTERNS) {
    const matchingEntries = entries.filter((entry) => entryMatchesPattern(entry, pattern));

    if (matchingEntries.length >= pattern.minMatches) {
      // Calculate confidence based on match count relative to minMatches
      const matchRatio = Math.min(matchingEntries.length / (pattern.minMatches * 2), 1);
      const confidence = Math.round(matchRatio * pattern.confidenceWeight * 100) / 100;

      const steps = inferSteps(matchingEntries, pattern);

      proposals.push({
        name: pattern.name,
        description: pattern.description,
        automationPotential: pattern.automationPotential,
        category: pattern.category,
        confidence,
        matchedPatterns: [pattern.id],
        suggestedTrigger: pattern.suggestedTrigger,
        steps: steps.length > 0 ? steps : undefined,
      });
    }
  }

  // Sort by confidence descending
  proposals.sort((a, b) => b.confidence - a.confidence);

  // Build summary
  let summary: string;
  if (proposals.length === 0) {
    summary = `Analyzed ${entries.length} session entries. No repeatable processes detected.`;
  } else {
    const automatableCount = proposals.filter((p) => p.automationPotential === 'automatable').length;
    const hybridCount = proposals.filter((p) => p.automationPotential === 'hybrid').length;
    const manualCount = proposals.filter((p) => p.automationPotential === 'manual').length;

    const parts: string[] = [];
    if (automatableCount > 0) parts.push(`${automatableCount} automatable`);
    if (hybridCount > 0) parts.push(`${hybridCount} hybrid`);
    if (manualCount > 0) parts.push(`${manualCount} manual`);

    summary = `Analyzed ${entries.length} session entries. Detected ${proposals.length} repeatable process(es): ${parts.join(', ')}. Top: "${proposals[0].name}" (confidence: ${proposals[0].confidence}).`;
  }

  return {
    entriesAnalyzed: entries.length,
    proposals,
    summary,
  };
}
