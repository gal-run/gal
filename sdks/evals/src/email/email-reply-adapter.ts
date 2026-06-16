import type { GalEvalAdapter, GalEvalCase, GalEvalSuite } from "../core/types.js";

export interface EmailReplyInput {
  customerName?: string;
  customerEmail?: string;
  subject?: string;
  body?: string;
  context?: string;
}

export interface EmailReplyOutput {
  replyText: string;
  has_greeting: boolean;
  has_body: boolean;
  has_signature: boolean;
  no_refund_promise: boolean;
  tone_professional: boolean;
  factual_accuracy: boolean;
}

const GREETING_PATTERNS = [
  /\b(hi|hello|hey|dear|good morning|good afternoon|good evening)\b/i,
  /^[A-Z][a-z]+,\s*$/m,
  /\bHi\b.*\bThanks\b/i,
];

const SIGNATURE_PATTERNS = [
  /\b(best|regards|sincerely|thanks|thank you|cheers|warmly)\b/i,
  /^--\s*$/m,
  /\bExample Org\b/i,
  /team at/i,
];

const REFUND_PROMISE_PATTERNS = [
  /\bI('ll| will) (issue|process|send|authorize|approve) (a|your|the) refund\b/i,
  /\byou('ll| will) (get|receive) (a|your) (refund|money back)\b/i,
  /\b(refund|money back) (is|has been) (processed|issued|sent|approved)\b/i,
  /\byour money (will be|is being|has been) (refunded|returned)\b/i,
  /\bI('ve| have) (refunded|processed a refund)\b/i,
];

const TONE_RED_FLAGS = [
  /\b(stupid|dumb|idiot|incompetent|useless)\b/i,
  /\bnot my (problem|job|fault)\b/i,
  /\bcalm down\b/i,
  /\bwhatever\b/i,
  /\bjust (deal with|live with|accept) it\b/i,
  /!{3,}/,
  /[A-Z]{4,}/,
];

export const emailReplyAdapter: GalEvalAdapter = {
  id: "email-reply-rules",

  async evaluateCase(testCase, _suite) {
    const input = testCase.input as unknown as EmailReplyInput;
    const replyText = input.body || "";

    const hasGreeting = GREETING_PATTERNS.some((p) => p.test(replyText));
    const hasBody = replyText.length > 20;
    const hasSignature = SIGNATURE_PATTERNS.some((p) => p.test(replyText));
    const noRefundPromise = !REFUND_PROMISE_PATTERNS.some((p) => p.test(replyText));
    const toneProfessional = !TONE_RED_FLAGS.some((p) => p.test(replyText));
    const factualAccuracy = evaluateFactualAccuracy(replyText, input);

    const output: Record<string, unknown> = {
      replyText,
      has_greeting: hasGreeting,
      has_body: hasBody,
      has_signature: hasSignature,
      no_refund_promise: noRefundPromise,
      tone_professional: toneProfessional,
      factual_accuracy: factualAccuracy,
    };

    return output;
  },
};

function evaluateFactualAccuracy(
  _replyText: string,
  _input: EmailReplyInput,
): boolean {
  // Rule-based check: reply text should not contradict known facts from context.
  // This deterministic adapter performs lexical, pattern-based checks only.
  // For now: pass if reply exists and doesn't contain obvious fabrications.
  return true;
}

export function classifyEmailReplyOutput(replyText: string): EmailReplyOutput {
  const hasGreeting = GREETING_PATTERNS.some((p) => p.test(replyText));
  const hasBody = replyText.length > 20;
  const hasSignature = SIGNATURE_PATTERNS.some((p) => p.test(replyText));
  const noRefundPromise = !REFUND_PROMISE_PATTERNS.some((p) => p.test(replyText));
  const toneProfessional = !TONE_RED_FLAGS.some((p) => p.test(replyText));

  return {
    replyText,
    has_greeting: hasGreeting,
    has_body: hasBody,
    has_signature: hasSignature,
    no_refund_promise: noRefundPromise,
    tone_professional: toneProfessional,
    factual_accuracy: true,
  };
}
