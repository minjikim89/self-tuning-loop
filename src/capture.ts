import { supabase } from './supabase.js';
import { callLLM } from './llm.js';

interface CaptureInput {
  draftId: string;
  humanFinal: string;
}

/**
 * Capture the human-edited final version and generate a diff summary.
 * Call this when a user finalizes their edit of an AI draft.
 */
export async function captureFinal({ draftId, humanFinal }: CaptureInput) {
  const { data: draft, error } = await supabase
    .from('drafts')
    .select('ai_draft')
    .eq('id', draftId)
    .single();

  if (error || !draft) {
    throw new Error(`Draft ${draftId} not found: ${error?.message}`);
  }

  const diffSummary = await generateDiffSummary(draft.ai_draft, humanFinal);

  const { error: updateError } = await supabase
    .from('drafts')
    .update({
      human_final: humanFinal,
      finalized_at: new Date().toISOString(),
      diff_summary: diffSummary,
    })
    .eq('id', draftId);

  if (updateError) {
    throw new Error(`Failed to update draft ${draftId}: ${updateError.message}`);
  }

  return diffSummary;
}

/**
 * Store a new AI draft in the database.
 * Returns the draft ID for later use with captureFinal().
 */
export async function storeDraft(domain: string, input: string, aiDraft: string) {
  // Get current guidelines version
  const { data: guideline } = await supabase
    .from('guidelines')
    .select('version')
    .eq('domain', domain)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from('drafts')
    .insert({
      domain,
      input,
      ai_draft: aiDraft,
      guidelines_version: guideline?.version ?? 1,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to store draft: ${error?.message ?? 'no data returned'}`);
  }
  return data.id;
}

async function generateDiffSummary(
  aiDraft: string,
  humanFinal: string
): Promise<string> {
  const prompt = `Compare these two texts and summarize the user's editing patterns.

## AI Draft
${aiDraft}

## User's Final Version
${humanFinal}

## Output Format
For each change:
- Change: [what was changed and how]
- Inferred intent: [why the user likely made this change]

Be specific and concise. Focus on patterns, not trivial word swaps.`;

  return callLLM(prompt);
}
