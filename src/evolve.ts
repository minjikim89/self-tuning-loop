import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from './supabase.js';
import { callLLM } from './llm.js';

const PROMPT_TEMPLATE = readFileSync(
  join(import.meta.dirname, '..', 'prompts', 'evolve-guidelines.md'),
  'utf-8'
);

/**
 * Evolve guidelines by applying Safe patterns from the latest analysis run.
 * Only adds rules — never modifies or removes existing ones.
 */
export async function evolveGuidelines(domain: string, dryRun = false) {
  // 1. Get latest unapplied analysis
  const { data: run } = await supabase
    .from('analysis_runs')
    .select('*')
    .eq('domain', domain)
    .eq('applied', false)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single();

  if (!run) {
    console.log(`${domain}: no pending analysis runs`);
    return null;
  }

  // 2. Filter Safe patterns only
  const safePatterns = (run.patterns?.patterns || [])
    .filter((p: any) => p.classification === 'safe');

  if (safePatterns.length === 0) {
    console.log(`${domain}: no Safe patterns, marking run as applied`);
    const { error } = await supabase.from('analysis_runs').update({ applied: true }).eq('id', run.id);
    if (error) console.error(`Warning: failed to mark run as applied: ${error.message}`);
    return null;
  }

  // 3. Get current guidelines
  const { data: current } = await supabase
    .from('guidelines')
    .select('*')
    .eq('domain', domain)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  // 4. Generate updated guidelines via LLM.
  // Neutralize closing-tag injection in interpolated content.
  const escapeTag = (s: string, tag: string) =>
    s.replace(new RegExp(`</${tag}>`, 'gi'), `<\\/${tag}>`);

  const guidelinesBlock = escapeTag(
    current?.content ?? '(No existing guidelines)',
    'guidelines'
  );
  const patternsBlock = escapeTag(
    JSON.stringify(safePatterns, null, 2),
    'patterns'
  );

  const prompt = PROMPT_TEMPLATE
    .replace('{current_guidelines}', guidelinesBlock)
    .replace('{safe_patterns}', patternsBlock)
    .replace('{date}', new Date().toISOString().split('T')[0]);

  const updatedContent = await callLLM(prompt);

  // 5. Dry-run: show preview without saving
  if (dryRun) {
    const newVersion = (current?.version ?? 0) + 1;
    console.log(`\n=== DRY RUN: ${domain} v${current?.version ?? 0} → v${newVersion} ===\n`);
    console.log(`Safe patterns to apply (${safePatterns.length}):`);
    for (const p of safePatterns) {
      console.log(`  • ${p.name} (${p.frequency})`);
    }
    console.log(`\n--- Proposed guidelines v${newVersion} ---\n`);
    console.log(updatedContent);
    console.log('\n--- End preview (no changes saved) ---\n');
    return { version: newVersion, addedPatterns: safePatterns.length, dryRun: true };
  }

  // 6. Save new version
  const newVersion = (current?.version ?? 0) + 1;
  const { error: insertError } = await supabase.from('guidelines').insert({
    domain,
    version: newVersion,
    content: updatedContent,
    source: 'auto_evolve',
    analysis_run_id: run.id,
  });

  if (insertError) {
    throw new Error(`Failed to save guidelines v${newVersion}: ${insertError.message}`);
  }

  // 7. Mark analysis as applied (only after guideline insert succeeds)
  const { error: markError } = await supabase
    .from('analysis_runs')
    .update({ applied: true })
    .eq('id', run.id);

  if (markError) {
    console.error(`Warning: guidelines v${newVersion} saved but failed to mark analysis as applied: ${markError.message}`);
  }

  console.log(`${domain}: guidelines v${current?.version ?? 0} → v${newVersion} (+${safePatterns.length} rules)`);
  return { version: newVersion, addedPatterns: safePatterns.length };
}

// CLI: npm run evolve -- <domain> [--dry-run]
//   e.g. npm run evolve -- email --dry-run
if (process.argv[2] === '--run') {
  const domain = process.argv[3];
  const dryRun = process.argv.includes('--dry-run');

  if (!domain || domain === '--dry-run') {
    console.error('Usage: npm run evolve -- <domain> [--dry-run]\n  e.g. npm run evolve -- email --dry-run');
    process.exit(1);
  }

  evolveGuidelines(domain, dryRun).then(r => {
    if (r && !r.dryRun) console.log(`Updated to v${r.version}`);
  });
}
