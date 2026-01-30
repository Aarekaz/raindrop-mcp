import { z } from 'zod';

// Bookmark output schema
export const BookmarkOutputSchema = z.object({
  _id: z.number(),
  link: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  important: z.boolean().optional(),
  created: z.string().optional(),
  collection: z.object({
    $id: z.number(),
  }).optional(),
}).passthrough();

// Collection output schema
export const CollectionOutputSchema = z.object({
  _id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  count: z.number().optional(),
  color: z.string().optional(),
  public: z.boolean().optional(),
}).passthrough();

// Search results output schema
export const BookmarkSearchOutputSchema = z.object({
  bookmarks: z.array(BookmarkOutputSchema),
  total: z.number(),
  page: z.number().optional(),
  hasMore: z.boolean(),
});

// Collection list output schema
export const CollectionListOutputSchema = z.object({
  collections: z.array(CollectionOutputSchema),
  total: z.number(),
});

// Tag output schema
export const TagOutputSchema = z.object({
  _id: z.string(),
  count: z.number(),
}).passthrough();

// Tag list output schema
export const TagListOutputSchema = z.object({
  tags: z.array(TagOutputSchema),
  total: z.number(),
});

// Highlight output schema
export const HighlightOutputSchema = z.object({
  _id: z.string(),
  text: z.string(),
  note: z.string().optional(),
  color: z.string().optional(),
  created: z.string().optional(),
  lastUpdate: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  link: z.string().optional(),
  raindropRef: z.number().optional(),
}).passthrough();

// Highlight list output schema
export const HighlightListOutputSchema = z.object({
  highlights: z.array(HighlightOutputSchema),
  total: z.number(),
});

// Suggestion output schema
export const SuggestionOutputSchema = z.object({
  suggestedCollections: z.array(z.number()).optional(),
  suggestedTags: z.array(z.string()).optional(),
  hasSuggestions: z.boolean(),
});

// Bulk edit output schema
export const BulkEditOutputSchema = z.object({
  modified: z.number(),
  bookmarkIds: z.array(z.number()),
});

// Bulk delete output schema
export const BulkDeleteOutputSchema = z.object({
  modified: z.number(),
});

// User stats output schema
export const UserStatsOutputSchema = z.object({
  items: z.array(z.object({
    _id: z.number(),
    count: z.number(),
  })),
  meta: z.object({
    pro: z.boolean().optional(),
    _id: z.number().optional(),
    changedBookmarksDate: z.string().optional(),
    duplicates: z.object({ count: z.number().optional() }).optional(),
    broken: z.object({ count: z.number().optional() }).optional(),
  }).optional(),
});
// Statistics output schema
export const StatisticsOutputSchema = z.object({
  broken: z.number().optional(),
  duplicates: z.number().optional(),
  important: z.number().optional(),
  notag: z.number().optional(),
  tags: z.array(z.object({
    _id: z.string(),
    count: z.number(),
  })).optional(),
  types: z.array(z.object({
    _id: z.string(),
    count: z.number(),
  })).optional(),
});

// Generic operation output schema
export const OperationResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  resourceUri: z.string().optional(),
});
