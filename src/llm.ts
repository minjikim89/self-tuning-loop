import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 8192);

export class LLMTruncatedError extends Error {
  constructor(public readonly partialText: string, public readonly maxTokens: number) {
    super(
      `LLM response hit max_tokens=${maxTokens} and was truncated. ` +
      `Increase ANTHROPIC_MAX_TOKENS or shorten the prompt. ` +
      `Refusing to return a partial result.`
    );
    this.name = 'LLMTruncatedError';
  }
}

/**
 * Call an LLM to process a prompt.
 * Model and max_tokens are configurable via ANTHROPIC_MODEL / ANTHROPIC_MAX_TOKENS.
 * Swap this function to use any other LLM provider.
 *
 * Throws LLMTruncatedError if the model's stop_reason is 'max_tokens', so callers
 * (especially evolve.ts, which persists the response as a new guidelines version)
 * never silently save a truncated artifact.
 */
export async function callLLM(prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('LLM returned empty or non-text response');
  }

  if (message.stop_reason === 'max_tokens') {
    throw new LLMTruncatedError(block.text, MAX_TOKENS);
  }

  return block.text;
}
