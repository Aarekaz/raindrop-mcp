# Raindrop MCP Server Evaluations

This directory contains evaluation questions to test whether LLMs can effectively use the Raindrop MCP server.

## Running Evaluations

Prerequisites:
- A Raindrop.io account with test data
- Valid RAINDROP_ACCESS_TOKEN in environment

To run evaluations:

```bash
# TODO: Add evaluation runner script
npm run eval
```

## Question Requirements

Each evaluation question must:
- Be **independent** (not depend on other questions)
- Be **read-only** (only non-destructive operations)
- Be **complex** (require 2-5 tool calls)
- Be **realistic** (based on real use cases)
- Have a **verifiable answer** (single, clear answer)
- Be **stable** (answer won't change over time)

## Question Generation Process

1. **Tool Inspection**: Review available tools (collection_list, bookmark_search, etc.)
2. **Content Exploration**: Use READ-ONLY operations to explore test data
3. **Question Creation**: Write 10 complex questions based on actual data
4. **Answer Verification**: Solve each question manually to verify answer

## Questions

The 10 evaluation questions cover:
1. Collection organization (finding collections by criteria)
2. Bookmark search (complex filters, tags, importance)
3. Tag analysis (most-used tags, tag combinations)
4. Temporal queries (recent bookmarks, date ranges)
5. Content analysis (highlights, excerpts)
6. Cross-collection queries (bookmarks across collections)
7. Metadata queries (broken links, duplicates)
8. Suggestion analysis (AI-powered insights)
9. Hierarchical queries (collections → bookmarks → highlights)
10. Statistical queries (counts, distributions)

See `raindrop.xml` for full question set.

## Test Data Setup

To run these evaluations, your Raindrop.io account should have:

1. **Collections** (at least 5):
   - "Research Papers" (public, > 10 bookmarks)
   - "Web Development" (with 7 important bookmarks)
   - "Resources" (with 3 broken links)
   - 2+ additional collections

2. **Bookmarks** (at least 50):
   - Some marked as important
   - Various tags (javascript, tutorial, react, typescript, documentation)
   - Some GitHub URLs (github.com)
   - Created across different dates
   - One titled "Introduction to Machine Learning" with 5 highlights

3. **Tags**: javascript, tutorial, react, typescript, documentation, others

4. **Quality Issues**: 3 broken links in "Resources" collection

You can create test data manually or use the `scripts/seed-test-data.ts` script (TODO).
