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
  operation: z.enum(['create', 'update', 'delete']),
  id: z.number().optional(),
});

// ==================== Search Schemas ====================

export const BookmarkSearchInputSchema = z.object({
  search: z.string().optional().describe('Full-text search query'),
  collection: z.number().optional().describe('Collection ID to search within'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  important: z.boolean().optional().describe('Filter by important/favorite status'),
  page: z.number().optional().describe('Page number for pagination'),
  perPage: z.number().optional().describe('Items per page (max 50)'),
  sort: z.string().optional().describe('Sort order: score, title, -created, created'),
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
