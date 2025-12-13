/**
 * API Service / API 服务
 * 动态获取和管理API端点，避免硬编码
 * Dynamically fetches and manages API endpoints to avoid hardcoding
 */

// API端点缓存 / API endpoint cache
let apiEndpoints: Record<string, any> = {};
let apiDocsCache: any = null;

// 后端API文档端点 / Backend API documentation endpoint
const API_DOCS_ENDPOINT = 'http://localhost:1106/api/docs';

/**
 * 获取API文档 / Get API documentation
 */
export async function getApiDocs(): Promise<any> {
  if (apiDocsCache) {
    return apiDocsCache;
  }

  try {
    const response = await fetch(API_DOCS_ENDPOINT);
    if (!response.ok) {
      throw new Error(`Failed to fetch API docs: ${response.status}`);
    }
    
    apiDocsCache = await response.json();
    return apiDocsCache;
  } catch (error) {
    console.error('Error fetching API documentation:', error);
    throw error;
  }
}

/**
 * 根据键获取API端点 / Get API endpoint by key
 * @param category API分类 / API category
 * @param action API操作 / API action
 * @returns API端点URL / API endpoint URL
 */
export function getEndpoint(category: string, action: string): string {
  const key = `${category}.${action}`;
  
  if (apiEndpoints[key]) {
    return apiEndpoints[key];
  }

  // 如果缓存中没有，尝试从API文档中获取 / If not in cache, try to get from API docs
  if (apiDocsCache && apiDocsCache.endpoints) {
    const endpointInfo = apiDocsCache.endpoints[category]?.[action];
    if (endpointInfo && endpointInfo.path) {
      // 端点信息是一个对象，我们需要获取path字段 / Endpoint info is an object, we need to get the path field
      apiEndpoints[key] = endpointInfo.path;
      return endpointInfo.path;
    }
  }

  // 如果API文档中没有找到，尝试使用默认路径 / If not found in API docs, try to use default paths
  const defaultPaths: Record<string, Record<string, string>> = {
    settings: {
      get: '/api/settings',
      save: '/api/settings',
      reset: '/api/settings/reset'
    },
    terminals: {
      list: '/api/terminals',
      create: '/api/terminals',
      get: '/api/terminals/:id',
      write: '/api/terminals/:id/input',
      read: '/api/terminals/:id/output',
      stats: '/api/terminals/:id/stats',
      kill: '/api/terminals/:id',
      resize: '/api/terminals/:id/resize',
      killAll: '/api/terminals/kill-all'
    },
    health: {
      check: '/health'
    },
    system: {
      health: '/health',
      stats: '/stats',
      version: '/api/version'
    }
  };

  if (defaultPaths[category]?.[action]) {
    apiEndpoints[key] = defaultPaths[category][action];
    return defaultPaths[category][action];
  }

  throw new Error(`API endpoint not found: ${key}`);
}

/**
 * 初始化API服务 / Initialize API service
 */
export async function initializeApiService(): Promise<void> {
  try {
    await getApiDocs();
    console.log('API service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize API service:', error);
    throw error;
  }
}

/**
 * 清除API缓存 / Clear API cache
 */
export function clearApiCache(): void {
  apiEndpoints = {};
  apiDocsCache = null;
}

/**
 * 通用API请求函数 / Generic API request function
 * @param category API分类 / API category
 * @param action API操作 / API action
 * @param options 请求选项 / Request options
 * @returns 响应数据 / Response data
 */
export async function apiRequest(
  category: string, 
  action: string, 
  options: RequestInit = {}
): Promise<Response> {
  const endpoint = getEndpoint(category, action);
  const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const requestOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  return fetch(url, requestOptions);
}

/**
 * 便捷的API方法 / Convenient API methods
 */

// 终端相关API / Terminal related APIs
// 终端相关API / Terminal related APIs
export const terminalApi = {
  list: () => apiRequest('terminals', 'list'),
  create: (data: any) => apiRequest('terminals', 'create', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  get: (id: string) => {
    const endpoint = getEndpoint('terminals', 'get').replace(':id', id);
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    return fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
  },
  delete: (id: string, signal?: string) => {
    const endpoint = getEndpoint('terminals', 'kill').replace(':id', id);
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    const params = new URLSearchParams();
    if (signal) params.append('signal', signal);
    const finalUrl = params.toString() ? `${url}?${params.toString()}` : url;
    return fetch(finalUrl, {
      method: 'DELETE'
    });
  },
  readOutput: (id: string, options?: any) => {
    const endpoint = getEndpoint('terminals', 'read').replace(':id', id);
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    const params = new URLSearchParams();
    if (options?.since) params.append('since', options.since.toString());
    if (options?.maxLines) params.append('maxLines', options.maxLines.toString());
    if (options?.mode) params.append('mode', options.mode);
    if (options?.headLines) params.append('headLines', options.headLines.toString());
    if (options?.tailLines) params.append('tailLines', options.tailLines.toString());
    if (options?.stripSpinner !== undefined) params.append('stripSpinner', options.stripSpinner.toString());
    
    const finalUrl = params.toString() ? `${url}?${params.toString()}` : url;
    return fetch(finalUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
  },
  writeInput: (id: string, input: string, appendNewline = true) => {
    const endpoint = getEndpoint('terminals', 'write').replace(':id', id);
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, appendNewline }),
    });
  },
  getStats: (id: string) => {
    const endpoint = getEndpoint('terminals', 'stats').replace(':id', id);
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    return fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
  },
  killAll: () => {
    const endpoint = getEndpoint('terminals', 'killAll');
    const url = endpoint.startsWith('http') ? endpoint : `http://localhost:1106${endpoint}`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// 系统相关 API / System related APIs
export const systemApi = {
  version: () => apiRequest('system', 'version')
};
// 设置相关API / Settings related APIs
export const settingsApi = {
  get: () => apiRequest('settings', 'get'),
  save: (data: any) => apiRequest('settings', 'save', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  reset: () => apiRequest('settings', 'reset', {
    method: 'POST',
  }),
};

// 健康检查API / Health check API
export const healthApi = {
  check: () => apiRequest('health', 'check'),
};
