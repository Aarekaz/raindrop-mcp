/**
 * Zod schemas for Raindrop.io data validation
 * Used for MCP tool input/output validation
 */

import { z } from 'zod';

// ==================== Collection Schemas ====================

export const CollectionOutputSchema = z.object({
  _id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  public: z.boolean().optional(),
  count: z.number().optional(),
  color: z.string().optional(),
  created: z.string().optional(),
  lastUpdate: z.string().optional(),
});

export const CollectionManageInputSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  id: z.number().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  public: z.boolean().optional(),
});

// ==================== Bookmark Schemas ====================

export const BookmarkOutputSchema = z.object({
  _id: z.number(),
  link: z.string(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  note: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  broken: z.boolean().optional(),
  created: z.string().optional(),
  lastUpdate: z.string().optional(),
  domain: z.string().optional(),
  collection: z.object({
    $id: z.number(),
  }).optional(),
});

export const BookmarkInputSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  collectionId: z.number().optional(),
});

export const BookmarkManageInputSchema = BookmarkInputSchema.extend({
  operation: z.enum(['create', 'update', 'delete', 'suggest']),
  id: z.number().optional(),
});

// ==================== Search Schemas ====================

export const BookmarkSearchInputSchema = z.object({
  search: z.string().optional().describe(
    'Full-text search query. Supports operators: #important, #broken, #duplicate, #notag, ' +
    'type:article, type:image, type:video, type:document, tag:name, created:YYYY-MM-DD'
  ),
  collection: z.number().optional().describe(
    'Collection ID to search within. Special IDs: -1 (Unsorted), -99 (Trash), 0 (All bookmarks)'
  ),
  tags: z.array(z.string()).optional().describe('Filter by tags (alternative to tag: operator in search)'),
  important: z.boolean().optional().describe('Filter by important/favorite status'),
  page: z.number().optional().describe('Page number for pagination (1-based)'),
  perPage: z.number().optional().describe('Items per page (max 50, default 25)'),
  sort: z.string().optional().describe('Sort order: score (relevance), title, -created (newest), created (oldest), -sort (custom order)'),
});

export const BookmarkSearchOutputSchema = z.object({
  items: z.array(BookmarkOutputSchema),
  count: z.number(),
});

// ==================== Tag Schemas ====================

export const TagOutputSchema = z.object({
  _id: z.string(),
  count: z.number(),
});

export const TagInputSchema = z.object({
  operation: z.enum(['list']),
  collectionId: z.number().optional(),
});

export const TagManageInputSchema = z.object({
  operation: z.enum(['list', 'rename', 'merge', 'delete']),
  collectionId: z.number().optional(),
  tags: z.array(z.string()).optional(),
  replace: z.string().optional(),
});

// ==================== Highlight Schemas ====================

export const HighlightOutputSchema = z.object({
  _id: z.string(),
  text: z.string(),
  note: z.string().optional(),
  color: z.string().optional(),
  created: z.string().optional(),
  lastUpdate: z.string().optional(),
});

export const HighlightInputSchema = z.object({
  bookmarkId: z.number().optional(),
  collectionId: z.number().optional(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  color: z.enum(['blue', 'brown', 'cyan', 'gray', 'green', 'indigo', 'orange', 'pink', 'purple', 'red', 'teal', 'yellow']).optional(),
  id: z.string().optional(),
});

export const HighlightManageInputSchema = HighlightInputSchema.extend({
  operation: z.enum(['create', 'update', 'delete', 'list']),
});

// ==================== Suggestion Schemas ====================

export const SuggestionOutputSchema = z.object({
  collections: z.array(z.object({
    $id: z.number(),
  })).optional().describe('Suggested collections for the URL'),
  tags: z.array(z.string()).optional().describe('Suggested tags based on content'),
});

export const SuggestionInputSchema = z.object({
  link: z.string().url().describe('URL to get suggestions for'),
});

// ==================== Filter/Statistics Schemas ====================

export const FilterStatsOutputSchema = z.object({
  broken: z.number().optional().describe('Number of broken/dead links'),
  duplicates: z.number().optional().describe('Number of duplicate bookmarks'),
  important: z.number().optional().describe('Number of important/favorite bookmarks'),
  notag: z.number().optional().describe('Number of untagged bookmarks'),
  tags: z.array(z.object({
    _id: z.string(),
    count: z.number(),
  })).optional().describe('Tags with usage counts'),
  types: z.array(z.object({
    _id: z.string().describe('Type: article, image, video, document, or link'),
    count: z.number(),
  })).optional().describe('Content types with counts'),
});

export const FilterStatsInputSchema = z.object({
  collectionId: z.number().describe('Collection ID to get statistics for (use 0 for all bookmarks)'),
  tagsSort: z.enum(['-count', '_id']).optional().describe('Sort tags by count (descending) or alphabetically'),
  search: z.string().optional().describe('Filter statistics by search query'),
});

// ==================== Bulk Edit Schemas ====================

export const BulkEditInputSchema = z.object({
  collectionId: z.number().describe('Collection to update bookmarks in'),
  ids: z.array(z.number()).optional().describe('Array of bookmark IDs to update. If omitted, all bookmarks in collection are updated'),
  important: z.boolean().optional().describe('Mark as favorite (true/false)'),
  tags: z.array(z.string()).optional().describe('Tags to set. Empty array removes all tags'),
  media: z.array(z.string()).optional().describe('Media URLs to set. Empty array removes all media'),
  cover: z.string().optional().describe('Cover URL. Use <screenshot> for auto screenshot'),
  moveToCollection: z.number().optional().describe('Move bookmarks to another collection by ID'),
});
