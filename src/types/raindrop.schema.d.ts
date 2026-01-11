/**
 * Type definitions for Raindrop.io API
 * Based on Raindrop.io API documentation
 */

export namespace components {
  export namespace schemas {
    /**
     * A Raindrop.io bookmark
     */
    export interface Bookmark {
      _id: number;
      link: string;
      title?: string;
      excerpt?: string;
      note?: string;
      type?: string;
      cover?: string;
      tags?: string[];
      important?: boolean;
      broken?: boolean;
      created?: string;
      lastUpdate?: string;
      domain?: string;
      media?: Array<{ link: string }>;
      highlights?: Highlight[];
      collection?: {
        $id: number;
        $ref?: string;
      };
      user?: {
        $id: number;
      };
    }

    /**
     * A Raindrop.io collection
     */
    export interface Collection {
      _id: number;
      title: string;
      description?: string;
      public?: boolean;
      view?: string;
      count?: number;
      cover?: string[];
      color?: string;
      sort?: number;
      expanded?: boolean;
      parent?: {
        $id: number;
      };
      author?: {
        $ref?: string;
        $id?: number;
      };
      user?: {
        $id: number;
      };
      created?: string;
      lastUpdate?: string;
    }

    /**
     * A text highlight from a bookmark
     */
    export interface Highlight {
      _id: string;
      text: string;
      note?: string;
      color?: 'blue' | 'brown' | 'cyan' | 'gray' | 'green' | 'indigo' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow';
      created?: string;
      lastUpdate?: string;
      raindrop?: {
        $id: number;
      };
    }

    /**
     * User information
     */
    export interface User {
      _id: number;
      email: string;
      name?: string;
      registered?: string;
      pro?: boolean;
      proExpire?: string;
    }

    /**
     * Tag with count
     */
    export interface Tag {
      _id: string;
      count: number;
    }

    /**
     * Suggestion result for collections and tags
     */
    export interface SuggestionResult {
      collections?: Array<{ $id: number }>;
      tags?: string[];
    }

    /**
     * Filter statistics for bookmarks
     */
    export interface FilterStats {
      broken?: number;
      duplicates?: number;
      important?: number;
      notag?: number;
      tags?: Array<{ _id: string; count: number }>;
      types?: Array<{ _id: string; count: number }>;
    }
  }
}

/**
 * API path definitions for type-safe requests
 */
export interface paths {
  '/collections': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              items: components['schemas']['Collection'][];
            };
          };
        };
      };
    };
  };
  '/collection': {
    post: {
      requestBody: {
        content: {
          'application/json': {
            title: string;
            public?: boolean;
          };
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Collection'];
            };
          };
        };
      };
    };
  };
  '/collection/{id}': {
    get: {
      parameters: {
        path: {
          id: number;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Collection'];
            };
          };
        };
      };
    };
    put: {
      parameters: {
        path: {
          id: number;
        };
      };
      requestBody: {
        content: {
          'application/json': Partial<components['schemas']['Collection']>;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Collection'];
            };
          };
        };
      };
    };
    delete: {
      parameters: {
        path: {
          id: number;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
            };
          };
        };
      };
    };
  };
  '/raindrop': {
    post: {
      requestBody: {
        content: {
          'application/json': {
            link: string;
            title?: string;
            excerpt?: string;
            tags?: string[];
            important?: boolean;
            collection: { $id: number };
            pleaseParse?: Record<string, unknown>;
          };
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Bookmark'];
            };
          };
        };
      };
    };
  };
  '/raindrop/{id}': {
    get: {
      parameters: {
        path: {
          id: number;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Bookmark'];
            };
          };
        };
      };
    };
    put: {
      parameters: {
        path: {
          id: number;
        };
      };
      requestBody: {
        content: {
          'application/json': Partial<components['schemas']['Bookmark']>;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['Bookmark'];
            };
          };
        };
      };
    };
    delete: {
      parameters: {
        path: {
          id: number;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
            };
          };
        };
      };
    };
  };
  '/raindrops/{id}': {
    get: {
      parameters: {
        path: {
          id: number;
        };
        query?: {
          search?: string;
          tag?: string;
          important?: boolean;
          page?: number;
          perpage?: number;
          sort?: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              items: components['schemas']['Bookmark'][];
              count: number;
            };
          };
        };
      };
    };
  };
  '/raindrops/0': {
    get: {
      parameters: {
        query?: {
          search?: string;
          tag?: string;
          important?: boolean;
          page?: number;
          perpage?: number;
          sort?: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              items: components['schemas']['Bookmark'][];
              count: number;
            };
          };
        };
      };
    };
  };
  '/user': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              user: components['schemas']['User'];
            };
          };
        };
      };
    };
  };
  '/tags/{collectionId}': {
    get: {
      parameters: {
        path: {
          id: number;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              items: components['schemas']['Tag'][];
            };
          };
        };
      };
    };
  };
  '/tags/0': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              items: components['schemas']['Tag'][];
            };
          };
        };
      };
    };
  };
  '/raindrop/suggest': {
    post: {
      requestBody: {
        content: {
          'application/json': {
            link: string;
          };
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              item: components['schemas']['SuggestionResult'];
            };
          };
        };
      };
    };
  };
  '/filters/{collectionId}': {
    get: {
      parameters: {
        path: {
          collectionId: number;
        };
        query?: {
          tagsSort?: '-count' | '_id';
          search?: string;
        };
      };
      responses: {
        200: {
          content: {
            'application/json': {
              result: boolean;
              broken?: number;
              duplicates?: number;
              important?: number;
              notag?: number;
              tags?: Array<{ _id: string; count: number }>;
              types?: Array<{ _id: string; count: number }>;
            };
          };
        };
      };
    };
  };
}
