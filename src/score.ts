import { supabase } from './supabase.js';

interface VersionScore {
  version: number;
  avgRating: number;
  draftCount: number;
  source: string;
  createdAt: string;
}

/**
 * Track quality score across guideline versions.
 * Compares average feedback_rating per guidelines_version to show
 * whether the Self-Tuning Loop is actually improving outputs.
 */
export async function getQualityScores(domain: string): Promise<VersionScore[]> {
  // Get all guidelines versions
  const { data: guidelines, error: gError } = await supabase
    .from('guidelines')
    .select('version, source, created_at')
    .eq('domain', domain)
    .order('version', { ascending: true });

  if (gError || !guidelines) {
    throw new Error(`Failed to fetch guidelines: ${gError?.message}`);
  }

  // Get average rating per guidelines_version
  const { data: drafts, error: dError } = await supabase
    .from('drafts')
    .select('guidelines_version, feedback_rating')
    .eq('domain', domain)
    .not('feedback_rating', 'is', null);

  if (dError) {
    throw new Error(`Failed to fetch drafts: ${dError.message}`);
  }

  // Aggregate ratings by version
  const ratingsByVersion = new Map<number, number[]>();
  for (const d of drafts || []) {
    const v = d.guidelines_version;
    if (!ratingsByVersion.has(v)) ratingsByVersion.set(v, []);
    ratingsByVersion.get(v)!.push(d.feedback_rating);
  }

  return guidelines.map(g => {
    const ratings = ratingsByVersion.get(g.version) || [];
    const avg = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    return {
      version: g.version,
      avgRating: Math.round(avg * 10) / 10,
      draftCount: ratings.length,
      source: g.source || 'manual',
      createdAt: g.created_at,
    };
  });
}

/**
 * Print quality score table to stdout.
 */
export async function printScoreReport(domain: string) {
  const scores = await getQualityScores(domain);

  if (scores.length === 0) {
    console.log(`${domain}: no guidelines found`);
    return;
  }

  console.log(`\n=== Quality Scores: ${domain} ===\n`);
  console.log('Version | Avg Rating | Drafts | Source       | Created');
  console.log('--------|------------|--------|-------------|--------');

  for (const s of scores) {
    const rating = s.draftCount > 0 ? `${s.avgRating}/5` : '—';
    const date = s.createdAt.split('T')[0];
    console.log(
      `v${String(s.version).padEnd(6)}| ${rating.padEnd(11)}| ${String(s.draftCount).padEnd(7)}| ${s.source.padEnd(12)}| ${date}`
    );
  }

  // Show trend if enough data
  const rated = scores.filter(s => s.draftCount > 0);
  if (rated.length >= 2) {
    const first = rated[0];
    const last = rated[rated.length - 1];
    const delta = last.avgRating - first.avgRating;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    console.log(`\nTrend: v${first.version} (${first.avgRating}) → v${last.version} (${last.avgRating}) ${arrow} ${delta > 0 ? '+' : ''}${delta}`);
  }

  console.log('');
}

// CLI: npm run score -- <domain>
if (process.argv[2] === '--run') {
  const domain = process.argv[3];
  if (!domain) {
    console.error('Usage: npm run score -- <domain>\n  e.g. npm run score -- email');
    process.exit(1);
  }
  printScoreReport(domain);
}
