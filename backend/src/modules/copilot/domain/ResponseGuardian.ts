import type { ContextChunk } from './ports.js';

export type GuardianReason =
  | 'empty_response'
  | 'response_too_long'
  | 'missing_citation'
  | 'invalid_citation'
  | 'unsafe_content'
  | 'prompt_injection';

export interface GuardianDecision {
  allowed: boolean;
  reason?: GuardianReason;
}

// This is intentionally conservative. A production deployment can replace
// this list with a dedicated moderation provider without changing the use case.
const UNSAFE_PATTERNS = [
  /\b(?:idiota|imbecil|estupido|estupida|pendejo|pendeja|mierda|marica)\b/i,
  /\b(?:fuck|shit|idiot|stupid|moron)\b/i,
];

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior)\s+instructions?/i,
  /ignora\s+(?:todas\s+)?(?:las\s+)?(?:instrucciones?|reglas?)(?:\s+anteriores)?/i,
  /revela\s+(?:tu|tus)\s+(?:prompt|instrucciones|configuracion)/i,
  /reveal\s+(?:your\s+)?(?:system\s+prompt|instructions?)/i,
  /(?:system|developer|assistant)\s*:\s*/i,
  /(?:prompt\s+del\s+sistema|mensaje\s+del\s+desarrollador)/i,
  /actua\s+como\s+(?:system|developer|root|admin)/i,
  /\b(?:jailbreak|do\s+anything\s+now)\b/i,
];

const SECRET_PATTERNS = [
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|contrasena)\s*[:=]/i,
  /\bsk-[a-z0-9_-]{20,}\b/i,
  /\beyj[a-z0-9_-]{20,}\b/i,
  /-----begin\s+(?:rsa\s+)?private\s+key-----/i,
];

function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' })[character] ?? character);
}

function contains(patterns: RegExp[], text: string): boolean {
  const normalized = normalize(text);
  return patterns.some((pattern) => pattern.test(normalized));
}

export function guardQuestion(question: string): GuardianDecision {
  if (contains(INJECTION_PATTERNS, question)) return { allowed: false, reason: 'prompt_injection' };
  if (contains(UNSAFE_PATTERNS, question)) return { allowed: false, reason: 'unsafe_content' };
  return { allowed: true };
}

/**
 * Validates only properties that can be checked without trusting the model:
 * the answer must be bounded, safe, and cite fragments from the exact
 * authorized context returned by PostgreSQL/RLS.
 */
export function guardResponse(answer: string, context: ContextChunk[]): GuardianDecision {
  const trimmed = answer.trim();
  if (!trimmed) return { allowed: false, reason: 'empty_response' };
  if (trimmed.length > 4000) return { allowed: false, reason: 'response_too_long' };
  if (contains(INJECTION_PATTERNS, trimmed)) return { allowed: false, reason: 'prompt_injection' };
  if (contains(UNSAFE_PATTERNS, trimmed)) return { allowed: false, reason: 'unsafe_content' };
  if (contains(SECRET_PATTERNS, trimmed)) return { allowed: false, reason: 'unsafe_content' };

  const citations = [...trimmed.matchAll(/\[msg:(\d+)\]/gi)].map((match) => Number(match[1]));
  if (citations.length === 0) return { allowed: false, reason: 'missing_citation' };
  if (citations.some((citation) => citation < 1 || citation > context.length)) {
    return { allowed: false, reason: 'invalid_citation' };
  }

  return { allowed: true };
}
