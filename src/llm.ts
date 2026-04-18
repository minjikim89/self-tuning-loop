import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

/**
 * Call an LLM to process a prompt.
 * Model is configurable via ANTHROPIC_MODEL env var.
 * Swap this function to use any other LLM provider.
 */
export async function callLLM(prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('LLM returned empty or non-text response');
  }
  return block.text;
}
