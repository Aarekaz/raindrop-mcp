/**
 * Raindrop.io API Service
 * 
 * Provides a clean interface to interact with the Raindrop.io REST API.
 * Uses openapi-fetch for type-safe API calls based on the API schema.
 */

import createClient from 'openapi-fetch';
import { Buffer } from 'buffer';
import type { components, paths } from '../types/raindrop.schema.js';
import { createLogger } from '../utils/logger.js';

type Bookmark = components.schemas.Bookmark;
type Collection = components.schemas.Collection;
type User = components.schemas.User;
type Tag = components.schemas.Tag;
type Highlight = components.schemas.Highlight;

const logger = createLogger('raindrop-service');

/**
 * Main service class for interacting with Raindrop.io API
 */
export class RaindropService {
  private client;
  private baseUrl = 'https://api.raindrop.io/rest/v1';
  private accessToken: string;

  constructor(token?: string) {
    const accessToken = token || process.env.RAINDROP_ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error(
        'RAINDROP_ACCESS_TOKEN is required. ' +
        'Get your token from https://app.raindrop.io/settings/integrations'
      );
    }

    this.accessToken = accessToken;
    this.client = createClient<paths>({
      baseUrl: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Add request/response interceptors
    this.client.use({
      onRequest({ request }) {
        logger.debug(`${request.method} ${request.url}`);
        return request;
      },
      onResponse({ response }) {
        if (!response.ok) {
          let errorMsg = `API Error: ${response.status} ${response.statusText}`;
          
          if (response.status === 401) {
            errorMsg += '. Invalid or expired RAINDROP_ACCESS_TOKEN';
          } else if (response.status === 429) {
            errorMsg += '. Rate limit exceeded, please wait before making more requests';
          } else if (response.status === 404) {
            errorMsg += '. Resource not found';
          }
          
          logger.error(errorMsg);
        }
      },
    });
  }

  // ==================== Collections ====================

  /**
   * Fetch all collections for the authenticated user
   */
  async getCollections(): Promise<Collection[]> {
    const { data, error } = await this.client.GET('/collections');
    
    if (error) {
      throw new Error(`Failed to fetch collections: ${error}`);
    }
    
    return data?.items || [];
  }

  async getChildCollections(): Promise<Collection[]> {
    const { data, error } = await this.client.GET('/collections/childrens');
    if (error) {
      throw new Error(`Failed to fetch child collections: ${error}`);
    }
    return data?.items || [];
  }

  async deleteCollections(ids: number[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/collections`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete collections: ${response.status}`);
    }
  }

  async reorderCollections(sort: 'title' | '-title' | '-count'): Promise<void> {
    const { error } = await (this.client as any).PUT('/collections', {
      body: { sort },
    });
    if (error) {
      throw new Error(`Failed to reorder collections: ${error}`);
    }
  }

  async setCollectionsExpanded(expanded: boolean): Promise<void> {
    const { error } = await (this.client as any).PUT('/collections', {
      body: { expanded },
    });
    if (error) {
      throw new Error(`Failed to set collections expanded=${expanded}: ${error}`);
    }
  }

  async mergeCollections(to: number, ids: number[]): Promise<void> {
    const { error } = await (this.client as any).PUT('/collections/merge', {
      body: { to, ids },
    });
    if (error) {
      throw new Error(`Failed to merge collections: ${error}`);
    }
  }

  async cleanCollections(): Promise<{ count: number }> {
    const { data, error } = await (this.client as any).PUT('/collections/clean');
    if (error) {
      throw new Error(`Failed to clean collections: ${error}`);
    }
    return { count: data?.count || 0 };
  }

  async emptyTrash(): Promise<void> {
    const { error } = await this.client.DELETE('/collection/-99');
    if (error) {
      throw new Error(`Failed to empty trash: ${error}`);
    }
  }

  async uploadCollectionCover(
    id: number,
    fileBase64: string,
    fileName: string,
    mimeType?: string
  ): Promise<void> {
    const bytes = Buffer.from(fileBase64, 'base64');
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('cover', blob, fileName);

    const response = await fetch(`${this.baseUrl}/collection/${id}/cover`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload collection cover: ${response.status}`);
    }
  }

  /**
   * Fetch a single collection by ID
   */
  async getCollection(id: number): Promise<Collection> {
    const { data, error } = await this.client.GET('/collection/{id}', {
      params: { path: { id } },
    });
    
    if (error || !data?.item) {
      throw new Error(`Collection ${id} not found`);
    }
    
    return data.item;
  }

  /**
   * Create a new collection
   */
  async createCollection(title: string, isPublic = false): Promise<Collection> {
    const { data, error } = await this.client.POST('/collection', {
      body: { title, public: isPublic },
    });
    
    if (error || !data?.item) {
      throw new Error(`Failed to create collection: ${error}`);
    }
    
    logger.info(`Created collection: ${title}`);
    return data.item;
  }

  /**
   * Update an existing collection
   */
  async updateCollection(id: number, updates: Partial<Collection>): Promise<Collection> {
    const { data, error } = await this.client.PUT('/collection/{id}', {
      params: { path: { id } },
      body: updates,
    });
    
    if (error || !data?.item) {
      throw new Error(`Failed to update collection ${id}: ${error}`);
    }
    
    logger.info(`Updated collection ${id}`);
    return data.item;
  }

  /**
   * Delete a collection
   */
  async deleteCollection(id: number): Promise<void> {
    const { error } = await this.client.DELETE('/collection/{id}', {
      params: { path: { id } },
    });
    
    if (error) {
      throw new Error(`Failed to delete collection ${id}: ${error}`);
    }
    
    logger.info(`Deleted collection ${id}`);
  }

  // ==================== Bookmarks ====================

  /**
   * Search and filter bookmarks
   */
  async getBookmarks(params: {
    search?: string;
    collection?: number;
    tags?: string[];
    important?: boolean;
    page?: number;
    perPage?: number;
    sort?: string;
    tag?: string;
  } = {}): Promise<{ items: Bookmark[]; count: number }> {
    const query: Record<string, any> = {};
    
    if (params.search) query.search = params.search;
    if (params.tags) query.tag = params.tags.join(',');
    if (params.tag) query.tag = params.tag;
    if (params.important !== undefined) query.important = params.important;
    if (params.page) query.page = params.page;
    if (params.perPage) query.perpage = params.perPage;
    if (params.sort) query.sort = params.sort;

    const endpoint = params.collection ? '/raindrops/{id}' : '/raindrops/0';
    const options = params.collection
      ? { params: { path: { id: params.collection }, query } }
      : { params: { query } };

    const { data, error } = await (this.client as any).GET(endpoint, options);
    
    if (error) {
      throw new Error(`Failed to fetch bookmarks: ${error}`);
    }
    
    return {
      items: data?.items || [],
      count: data?.count || 0,
    };
  }

  /**
   * Fetch a single bookmark by ID
   */
  async getBookmark(id: number): Promise<Bookmark> {
    const { data, error } = await this.client.GET('/raindrop/{id}', {
      params: { path: { id } },
    });
    
    if (error || !data?.item) {
      throw new Error(`Bookmark ${id} not found`);
    }
    
    return data.item;
  }

  async getRaindropCacheUrl(id: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/raindrop/${id}/cache`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      redirect: 'manual',
    });

    if (response.status === 307 || response.status === 302) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Cache redirect missing Location header');
      }
      return location;
    }

    if (!response.ok) {
      throw new Error(`Failed to get cache URL: ${response.status}`);
    }

    const location = response.headers.get('location');
    if (location) {
      return location;
    }
    throw new Error('Cache URL not available');
  }

  /**
   * Create a new bookmark
   */
  async createBookmark(
    collectionId: number,
    bookmark: {
      link: string;
      title?: string;
      excerpt?: string;
      tags?: string[];
      important?: boolean;
    }
  ): Promise<Bookmark> {
    const { data, error } = await this.client.POST('/raindrop', {
      body: {
        link: bookmark.link,
        ...(bookmark.title && { title: bookmark.title }),
        ...(bookmark.excerpt && { excerpt: bookmark.excerpt }),
        ...(bookmark.tags && { tags: bookmark.tags }),
        important: bookmark.important || false,
        collection: { $id: collectionId },
        pleaseParse: {},
      },
    });
    
    if (error || !data?.item) {
      throw new Error(`Failed to create bookmark: ${error}`);
    }
    
    logger.info(`Created bookmark: ${bookmark.link}`);
    return data.item;
  }

  async bulkCreateBookmarks(items: Array<{
    link: string;
    title?: string;
    excerpt?: string;
    tags?: string[];
    important?: boolean;
    collectionId?: number;
    cover?: string;
    media?: string[];
    type?: string;
    note?: string;
    pleaseParse?: boolean;
  }>): Promise<Bookmark[]> {
    const payloadItems = items.map((item) => ({
      link: item.link,
      ...(item.title && { title: item.title }),
      ...(item.excerpt && { excerpt: item.excerpt }),
      ...(item.tags && { tags: item.tags }),
      ...(item.important !== undefined && { important: item.important }),
      ...(item.cover && { cover: item.cover }),
      ...(item.media && { media: item.media }),
      ...(item.type && { type: item.type }),
      ...(item.note && { note: item.note }),
      ...(item.pleaseParse && { pleaseParse: {} }),
      ...(item.collectionId !== undefined && { collection: { $id: item.collectionId } }),
    }));

    const { data, error } = await (this.client as any).POST('/raindrops', {
      body: { items: payloadItems },
    });

    if (error) {
      throw new Error(`Failed to create multiple bookmarks: ${error}`);
    }

    return data?.items || [];
  }

  /**
   * Get AI-powered suggestions for collections and tags for a URL
   * Perfect for auto-categorization before creating a bookmark
   */
  async getSuggestions(link: string): Promise<{ collections?: Array<{ $id: number }>; tags?: string[] }> {
    const { data, error } = await this.client.POST('/raindrop/suggest', {
      body: { link },
    });

    if (error || !data?.item) {
      throw new Error(`Failed to get suggestions: ${error}`);
    }

    logger.info(`Got suggestions for ${link}`);
    return data.item;
  }

  async getSuggestionsForBookmark(id: number): Promise<{ collections?: Array<{ $id: number }>; tags?: string[] }> {
    const { data, error } = await this.client.GET('/raindrop/{id}/suggest', {
      params: { path: { id } },
    });

    if (error || !data?.item) {
      throw new Error(`Failed to get suggestions for bookmark ${id}: ${error}`);
    }

    logger.info(`Got suggestions for bookmark ${id}`);
    return data.item;
  }

  /**
   * Update an existing bookmark
   */
  async updateBookmark(id: number, updates: Partial<Bookmark>): Promise<Bookmark> {
    const { data, error } = await this.client.PUT('/raindrop/{id}', {
      params: { path: { id } },
      body: updates,
    });
    
    if (error || !data?.item) {
      throw new Error(`Failed to update bookmark ${id}: ${error}`);
    }
    
    logger.info(`Updated bookmark ${id}`);
    return data.item;
  }

  /**
   * Delete a bookmark
   */
  async deleteBookmark(id: number): Promise<void> {
    const { error } = await this.client.DELETE('/raindrop/{id}', {
      params: { path: { id } },
    });
    
    if (error) {
      throw new Error(`Failed to delete bookmark ${id}: ${error}`);
    }
    
    logger.info(`Deleted bookmark ${id}`);
  }

  async bulkDeleteBookmarks(
    collectionId: number,
    params: { ids?: number[]; search?: string; nested?: boolean }
  ): Promise<{ modified: number }> {
    const url = new URL(`${this.baseUrl}/raindrops/${collectionId}`);
    if (params.search) url.searchParams.set('search', params.search);
    if (params.nested !== undefined) url.searchParams.set('nested', String(params.nested));

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ ids: params.ids }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete bookmarks: ${response.status}`);
    }

    const data = await response.json() as { modified?: number };
    return { modified: data.modified || 0 };
  }

  /**
   * Bulk update bookmarks in a collection
   */
  async bulkUpdateBookmarks(collectionId: number, updates: {
    ids?: number[];
    important?: boolean;
    tags?: string[];
    media?: string[];
    cover?: string;
    collection?: { $id: number };
  }): Promise<{ modified: number }> {
    const url = `${this.baseUrl}/raindrops/${collectionId}`;
    const body: Record<string, any> = {};
    
    if (updates.ids) body.ids = updates.ids;
    if (updates.important !== undefined) body.important = updates.important;
    if (updates.tags !== undefined) body.tags = updates.tags;
    if (updates.media !== undefined) body.media = updates.media;
    if (updates.cover) body.cover = updates.cover;
    if (updates.collection) body.collection = updates.collection;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Bulk update failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as { result: boolean; modified?: number };
      
      if (!result.result) {
        throw new Error('Bulk update operation failed');
      }

      logger.info(`Bulk updated ${result.modified || 0} bookmarks`);
      return { modified: result.modified || 0 };
    } catch (error) {
      logger.error('Bulk update error:', error);
      throw error;
    }
  }

  // ==================== Tags ====================

  /**
   * Fetch tags for a collection or all tags
   */
  async getTags(collectionId?: number): Promise<Tag[]> {
    const endpoint = collectionId ? '/tags/{collectionId}' : '/tags/0';
    const options = collectionId
      ? { params: { path: { id: collectionId } } }
      : undefined;

    const { data, error } = await (this.client as any).GET(endpoint, options);
    
    if (error) {
      throw new Error(`Failed to fetch tags: ${error}`);
    }
    
    return data?.items || [];
  }

  async renameTag(
    tags: string[],
    replace: string,
    collectionId?: number
  ): Promise<void> {
    const endpoint = collectionId ? `/tags/${collectionId}` : '/tags/0';
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ tags, replace }),
    });

    if (!response.ok) {
      throw new Error(`Failed to rename tag(s): ${response.status}`);
    }
  }

  async mergeTags(
    tags: string[],
    replace: string,
    collectionId?: number
  ): Promise<void> {
    const endpoint = collectionId ? `/tags/${collectionId}` : '/tags/0';
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ tags, replace }),
    });

    if (!response.ok) {
      throw new Error(`Failed to merge tags: ${response.status}`);
    }
  }

  async deleteTags(tags: string[], collectionId?: number): Promise<void> {
    const endpoint = collectionId ? `/tags/${collectionId}` : '/tags/0';
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ tags }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete tags: ${response.status}`);
    }
  }

  /**
   * Get filter statistics and counts for a collection
   * Useful for bookmark analysis, cleanup suggestions, and insights
   */
  async getFilters(
    collectionId: number,
    options: {
      tagsSort?: '-count' | '_id';
      search?: string;
    } = {}
  ): Promise<{
    broken?: number;
    duplicates?: number;
    important?: number;
    notag?: number;
    tags?: Array<{ _id: string; count: number }>;
    types?: Array<{ _id: string; count: number }>;
  }> {
    const query: Record<string, string> = {};
    if (options.tagsSort) query.tagsSort = options.tagsSort;
    if (options.search) query.search = options.search;

    const endpoint = '/filters/{collectionId}';
    const { data, error } = await this.client.GET(endpoint, {
      params: {
        path: { collectionId },
        query: query as any,
      },
    });

    if (error) {
      throw new Error(`Failed to fetch filters: ${error}`);
    }

    logger.info(`Fetched filter statistics for collection ${collectionId}`);
    const normalizeCount = (value: unknown): number | undefined => {
      if (typeof value === 'number') {
        return value;
      }
      if (value && typeof value === 'object' && 'count' in value) {
        const countValue = (value as { count?: unknown }).count;
        return typeof countValue === 'number' ? countValue : undefined;
      }
      return undefined;
    };

    return {
      broken: normalizeCount(data?.broken),
      duplicates: normalizeCount(data?.duplicates),
      important: normalizeCount(data?.important),
      notag: normalizeCount(data?.notag),
      tags: data?.tags,
      types: data?.types,
    };
  }

  // ==================== Highlights ====================

  /**
   * Fetch highlights for a specific bookmark
   */
  async getHighlights(bookmarkId: number): Promise<Highlight[]> {
    const url = new URL(`${this.baseUrl}/raindrop/${bookmarkId}/highlights`);
    return this.fetchHighlights(url, `bookmark ${bookmarkId}`);
  }

  /**
   * Fetch all highlights (optionally paginated)
   */
  async getHighlightsAll(page?: number, perPage?: number): Promise<Highlight[]> {
    const url = new URL(`${this.baseUrl}/highlights`);
    if (page) url.searchParams.set('page', String(page));
    if (perPage) url.searchParams.set('perpage', String(perPage));
    return this.fetchHighlights(url, 'all highlights');
  }

  /**
   * Fetch highlights for a collection (optionally paginated)
   */
  async getHighlightsByCollection(
    collectionId: number,
    page?: number,
    perPage?: number
  ): Promise<Highlight[]> {
    const url = new URL(`${this.baseUrl}/highlights/${collectionId}`);
    if (page) url.searchParams.set('page', String(page));
    if (perPage) url.searchParams.set('perpage', String(perPage));
    return this.fetchHighlights(url, `collection ${collectionId}`);
  }

  private async fetchHighlights(url: URL, label: string): Promise<Highlight[]> {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch highlights (${label}): ${response.status}`);
      }

      const result = await response.json() as { items?: Highlight[]; item?: { highlights?: Highlight[] } };
      if (result.items) {
        return result.items || [];
      }
      if (result.item?.highlights) {
        return result.item.highlights || [];
      }
      return [];
    } catch (error) {
      logger.error(`Error fetching highlights (${label}):`, error);
      throw error;
    }
  }

  /**
   * Create a new highlight for a bookmark
   */
  async createHighlight(
    bookmarkId: number,
    highlight: {
      text: string;
      note?: string;
      color?: string;
    }
  ): Promise<Highlight> {
    const url = `${this.baseUrl}/highlights`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          text: highlight.text,
          note: highlight.note,
          color: highlight.color || 'yellow',
          raindrop: { $id: bookmarkId },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create highlight: ${response.status}`);
      }

      const result = await response.json() as { item: Highlight };
      
      if (!result.item) {
        throw new Error('Failed to create highlight');
      }

      logger.info(`Created highlight for bookmark ${bookmarkId}`);
      return result.item;
    } catch (error) {
      logger.error('Error creating highlight:', error);
      throw error;
    }
  }

  /**
   * Update an existing highlight
   */
  async updateHighlight(
    id: string,
    updates: {
      text?: string;
      note?: string;
      color?: string;
    }
  ): Promise<Highlight> {
    const url = `${this.baseUrl}/highlights/${id}`;
    
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update highlight: ${response.status}`);
      }

      const result = await response.json() as { item: Highlight };
      
      if (!result.item) {
        throw new Error('Failed to update highlight');
      }

      logger.info(`Updated highlight ${id}`);
      return result.item;
    } catch (error) {
      logger.error('Error updating highlight:', error);
      throw error;
    }
  }

  /**
   * Delete a highlight
   */
  async deleteHighlight(id: string): Promise<void> {
    const url = `${this.baseUrl}/highlights/${id}`;
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete highlight: ${response.status}`);
      }

      logger.info(`Deleted highlight ${id}`);
    } catch (error) {
      logger.error('Error deleting highlight:', error);
      throw error;
    }
  }

  async uploadRaindropCover(
    id: number,
    fileBase64: string,
    fileName: string,
    mimeType?: string
  ): Promise<void> {
    const bytes = Buffer.from(fileBase64, 'base64');
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('cover', blob, fileName);

    const response = await fetch(`${this.baseUrl}/raindrop/${id}/cover`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload raindrop cover: ${response.status}`);
    }
  }

  async uploadRaindropFile(
    fileBase64: string,
    fileName: string,
    mimeType?: string,
    collectionId?: number
  ): Promise<Bookmark> {
    const bytes = Buffer.from(fileBase64, 'base64');
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    form.append('file', blob, fileName);
    if (collectionId !== undefined) {
      form.append('collectionId', String(collectionId));
    }

    const response = await fetch(`${this.baseUrl}/raindrop/file`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status}`);
    }

    const result = await response.json() as { item: Bookmark };
    return result.item;
  }

  // ==================== User ====================

  /**
   * Fetch authenticated user information
   */
  async getUserInfo(): Promise<User> {
    const { data, error } = await this.client.GET('/user');
    
    if (error || !data?.user) {
      throw new Error(`Failed to fetch user info: ${error}`);
    }
    
    return data.user;
  }

  async getUserStats(): Promise<{ items: Array<{ _id: number; count: number }>; meta?: Record<string, unknown> }> {
    const { data, error } = await (this.client as any).GET('/user/stats');
    if (error || !data) {
      throw new Error(`Failed to fetch user stats: ${error}`);
    }
    return {
      items: data.items || [],
      meta: data.meta,
    };
  }
}

export default RaindropService;
