#!/bin/bash
set -e

echo "=== Self-Tuning Loop Setup ==="
echo ""

# 1. Check prerequisites
command -v node >/dev/null 2>&1 || {
  echo "Error: Node.js not found."
  exit 1
}

# 2. Install dependencies
echo "[1/4] Installing dependencies..."
npm install

# 3. Supabase setup
echo ""
echo "[2/4] Supabase setup"
echo "You need a Supabase project. Create one at https://supabase.com/dashboard"
echo ""

if [ ! -f .env ]; then
  read -p "Supabase Project URL (https://xxx.supabase.co): " SUPABASE_URL
  read -p "Supabase Service Role Key: " SUPABASE_SERVICE_KEY
  read -p "Anthropic API Key: " ANTHROPIC_API_KEY

  cat > .env << EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
EOF
  echo "  → .env created"
else
  echo "  → .env already exists, skipping"
fi

# 4. Create tables
echo ""
echo "[3/4] Creating database tables..."
echo "Paste the contents of supabase/migrations/001_init.sql into your"
echo "Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)"
echo "or run: supabase link && supabase db push"
echo ""
read -p "Press Enter after tables are created..."

# 5. Seed initial guideline
echo ""
echo "[4/4] Seeding example guideline..."
node --input-type=module -e "
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const content = readFileSync('guidelines/example-email.md', 'utf-8');

const { error } = await sb.from('guidelines').insert({
  domain: 'email',
  version: 1,
  content,
  source: 'manual'
});

if (error) console.error('Seed failed:', error.message);
else console.log('  → Seeded email guidelines v1');
"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Integrate storeDraft() and captureFinal() into your app"
echo "  2. Schedule weekly analysis: npm run analyze -- email 7"
echo "  3. Schedule weekly evolution: npm run evolve -- email"
echo ""
echo "Read the docs: https://github.com/minjikim89/self-tuning-loop"
