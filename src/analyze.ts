import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from './supabase.js';
import { callLLM } from './llm.js';

const PROMPT_TEMPLATE = readFileSync(
  join(import.meta.dirname, '..', 'prompts', 'analyze-diffs.md'),
  'utf-8'
);

/**
 * Analyze accumulated diffs for a domain and extract repeating patterns.
 * Run this on a schedule (e.g., weekly) or after N drafts are finalized.
 */
export async function analyzeDiffs(domain: string, lookbackDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data: drafts, error } = await supabase
    .from('drafts')
    .select('diff_summary, feedback_rating, feedback_comment')
    .eq('domain', domain)
    .not('human_final', 'is', null)
    .gte('finalized_at', since.toISOString())
    .order('finalized_at', { ascending: false });

  if (error) throw new Error(`Query failed: ${error.message}`);

  if (!drafts || drafts.length < 3) {
    console.log(`${domain}: ${drafts?.length ?? 0} drafts — need at least 3, skipping`);
    return null;
  }

  const diffSummaries = drafts
    .map((d, i) => {
      let entry = `### Draft ${i + 1}\n${d.diff_summary}`;
      if (d.feedback_rating) entry += `\nRating: ${d.feedback_rating}/5`;
      if (d.feedback_comment) entry += `\nComment: ${d.feedback_comment}`;
      return entry;
    })
    .join('\n\n');

  const prompt = PROMPT_TEMPLATE
    .replace('{N}', String(drafts.length))
    .replace('{domain}', domain)
    .replace('{diff_summaries}', diffSummaries);

  const result = await callLLM(prompt);

  // Extract JSON from LLM response
  const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/) || [null, result];
  let patterns: any;
  try {
    patterns = JSON.parse(jsonMatch[1] || result);
  } catch {
    console.error(`${domain}: LLM returned invalid JSON, raw response:\n${result.slice(0, 500)}`);
    return null;
  }

  const { data: run, error: insertError } = await supabase
    .from('analysis_runs')
    .insert({
      domain,
      draft_count: drafts.length,
      patterns,
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to save analysis run: ${insertError.message}`);
  }

  console.log(`${domain}: analyzed ${drafts.length} drafts → ${patterns.patterns?.length ?? 0} patterns`);
  return { runId: run.id, patterns };
}

// CLI: npm run analyze -- <domain> <days>
//   e.g. npm run analyze -- email 7
if (process.argv[2] === '--run') {
  const domain = process.argv[3];
  const days = parseInt(process.argv[4] || '7');

  if (!domain) {
    console.error('Usage: npm run analyze -- <domain> [days]\n  e.g. npm run analyze -- email 7');
    process.exit(1);
  }
  if (isNaN(days) || days < 1) {
    console.error(`Invalid days: "${process.argv[4]}". Must be a positive integer.`);
    process.exit(1);
  }

  analyzeDiffs(domain, days).then(r => {
    if (r) console.log(JSON.stringify(r.patterns, null, 2));
  });
}
