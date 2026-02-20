import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002/api/v1';
export const API_PROXY_URL = `${API_URL}/proxy?url=`;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Trend {
  event_title: string;
  summary: string;
  category: string;
  importance_score: number;
  urgency_score: number;
  trend_score: number;
  source_urls: string[];
}

export interface TrendsResponse {
  trends: Trend[];
  provider: string;
  model?: string;
  nickname?: string;
}

let cachedTrends: TrendsResponse | null = null;

export const getTrends = async (forceRefresh = false): Promise<TrendsResponse> => {
  if (!forceRefresh && cachedTrends) {
    return cachedTrends;
  }
  const response = await api.get('/trends');
  cachedTrends = response.data;
  return response.data;
};

export interface ScriptResponse {
  script: {
    hook: string;
    main_story: string;
    why_it_matters: string;
    ending_line: string;
  };
  metadata: {
    titles: string[];
    thumbnail_text: string;
    hashtags: string[];
  };
}

export const generateScript = async (trendData: any): Promise<ScriptResponse> => {
  const response = await api.post('/generate-script', trendData);
  return response.data;
};

export interface VideoResponse {
  job_id: string;
  status: string;
  message: string;
  provider: string;
}

export const generateVideo = async (scriptData: ScriptResponse): Promise<VideoResponse> => {
  const response = await api.post('/generate-video', scriptData);
  return response.data;
};

export interface JobStatusResponse {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  percent?: number;
  video_url?: string;
  error?: string;
}

export const getJobStatus = async (jobId: string): Promise<JobStatusResponse> => {
  const response = await api.get(`/jobs/${jobId}`);
  return response.data;
};

export interface NewsConfig {
  id: string;
  provider: string;
  api_key: string;
  model?: string;
  is_default: boolean;
  nickname?: string;
}

export interface ScriptConfig {
  id: string;
  provider: string;
  model: string;
  api_key: string;
  is_default: boolean;
  nickname?: string;
}

export interface Settings {
  news_provider: string;
  news_api_key: string; // Deprecated
  gemini_api_key?: string;
  newsapi_api_key?: string;
  news_model?: string;
  news_nickname?: string;
  news_configs?: NewsConfig[];
  script_provider: string;
  script_api_key: string;
  script_model: string;
  script_configs?: ScriptConfig[];
  video_provider: string;
  video_api_key: string;
}

export const getSettings = async (): Promise<Settings> => {
  const response = await api.get('/settings');
  return response.data;
};

export const updateSettings = async (settings: Settings) => {
  const response = await api.post('/settings', settings);
  return response.data;
};

export const verifyGemini = async (apiKey: string): Promise<{ status: string; models: string[] }> => {
  const response = await api.post('/verify-gemini', { api_key: apiKey });
  return response.data;
};

export const verifyNewsAPI = async (apiKey: string): Promise<{ status: string; message: string }> => {
  const response = await api.post('/verify-newsapi', { api_key: apiKey });
  return response.data;
};

export const verifyOpenAI = async (apiKey: string): Promise<{ status: string; models: string[] }> => {
  const response = await api.post('/verify-openai', { api_key: apiKey });
  return response.data;
};

export const verifyAnthropic = async (apiKey: string): Promise<{ status: string; models: string[] }> => {
  const response = await api.post('/verify-anthropic', { api_key: apiKey });
  return response.data;
};
