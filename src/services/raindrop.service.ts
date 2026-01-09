/**
 * Raindrop.io API Service
 * 
 * Provides a clean interface to interact with the Raindrop.io REST API.
 * Uses openapi-fetch for type-safe API calls based on the API schema.
 */

import createClient from 'openapi-fetch';
import type { components, paths } from '../types/raindrop.schema.js';
import { createLogger } from '../utils/logger.js';

type Bookmark = components['schemas']['Bookmark'];
type Collection = components['schemas']['Collection'];
type User = components['schemas']['User'];
type Tag = components['schemas']['Tag'];

const logger = createLogger('raindrop-service');

/**
 * Main service class for interacting with Raindrop.io API
 */
export class RaindropService {
  private client;

  constructor(token?: string) {
    const accessToken = token || process.env.RAINDROP_ACCESS_TOKEN;
    
    if (!accessToken) {
      throw new Error(
        'RAINDROP_ACCESS_TOKEN is required. ' +
        'Get your token from https://app.raindrop.io/settings/integrations'
      );
    }

    this.client = createClient<paths>({
      baseUrl: 'https://api.raindrop.io/rest/v1',
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
          throw new Error(errorMsg);
        }
        return response;
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
}

export default RaindropService;
