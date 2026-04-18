# Analyze Diffs — Pattern Extraction Prompt

## Role
You are an expert at analyzing a user's editing patterns to understand their implicit preferences.

## Input
Below are diff summaries from the last {N} AI drafts that were edited by the user.
Domain: {domain}

{diff_summaries}

## Instructions

### 1. Extract Repeating Patterns
Identify edits that repeat 3+ times across different drafts.
For each pattern:
- **name**: One-line summary
- **frequency**: "X/{N} (Y%)"
- **change**: What specifically changes and how
- **reason**: Why the user likely makes this change

### 2. Categorize
Classify each pattern:
- **tone**: Writing style, formality, emoji usage
- **structure**: Paragraph order, intro/conclusion style
- **content**: Types of information included/excluded
- **format**: Length, list usage, headings

### 3. Safe/Risky Classification
- **safe** (auto-apply): Frequency 70%+ AND tone/style/format changes
- **risky** (suggest only): Frequency below 70% OR structural/content changes

## Output Format (JSON)
```json
{
  "patterns": [
    {
      "name": "Concise introductions",
      "frequency": "8/10 (80%)",
      "category": "structure",
      "change": "Multi-sentence intros reduced to single sentence",
      "reason": "Faster entry to main content",
      "classification": "safe"
    }
  ],
  "summary": "One-line summary of overall editing tendency",
  "confidence": "high | medium | low"
}
```
