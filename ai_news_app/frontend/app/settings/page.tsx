'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateSettings, verifyGemini, verifyNewsAPI, verifyOpenAI, verifyAnthropic, Settings, ScriptConfig, NewsConfig } from '@/lib/api';
import { Loader2, Key, CheckCircle, Save, Plus, Trash2, Star, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    news_provider: '',
    news_api_key: '',
    gemini_api_key: '',
    newsapi_api_key: '',
    news_model: '',
    news_nickname: '',
    news_configs: [],
    script_provider: '',
    script_api_key: '',
    script_model: 'gpt-4o',
    script_configs: [],
    video_provider: '',
    video_api_key: ''
  });
  const [success, setSuccess] = useState(false);
  
  // Script Configs Working State (models fetched per config)
  const [configModels, setConfigModels] = useState<Record<string, string[]>>({});
  const [verifyingConfigId, setVerifyingConfigId] = useState<string | null>(null);
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({});

  // Gemini Verification State (Legacy for News Agent)
  const [isVerifyingGemini, setIsVerifyingGemini] = useState(false);
  const [verifiedModels, setVerifiedModels] = useState<string[]>([]);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  // NewsAPI Verification State
  const [isVerifyingNewsAPI, setIsVerifyingNewsAPI] = useState(false);
  const [newsApiSuccess, setNewsApiSuccess] = useState<boolean>(false);
  const [newsApiError, setNewsApiError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getSettings();
        // Normalize keys for the UI - Move legacy news_api_key to specific slot if specific is missing
        let news_provider = data.news_provider || '';
        let gemini_api_key = data.gemini_api_key || '';
        let newsapi_api_key = data.newsapi_api_key || '';
        
        if (news_provider === 'gemini' && !gemini_api_key && data.news_api_key) {
            gemini_api_key = data.news_api_key;
        } else if (news_provider === 'newsapi' && !newsapi_api_key && data.news_api_key) {
            newsapi_api_key = data.news_api_key;
        }

        setSettings(prev => ({ 
          ...prev, 
          ...data,
          gemini_api_key,
          newsapi_api_key,
          script_configs: data.script_configs || []
        }));
        
        if (news_provider === 'gemini' && data.news_model) {
            setVerifiedModels(prev => [...prev.filter(m => m !== data.news_model), data.news_model!]);
        }

        // Initialize news_configs if empty using legacy data
        let news_configs = data.news_configs || [];
        if (news_configs.length === 0 && (data.news_provider || data.news_api_key)) {
            news_configs = [{
                id: 'primary-news',
                provider: data.news_provider || 'newsapi',
                api_key: data.newsapi_api_key || data.gemini_api_key || data.news_api_key || '',
                model: data.news_model,
                nickname: data.news_nickname || 'Primary News Source',
                is_default: true
            }];
        }

        setSettings(prev => ({ 
          ...prev, 
          ...data,
          news_configs,
          script_configs: data.script_configs || []
        }));
        
        // Initialize models for existing news configs
        const initialNewsModels: Record<string, string[]> = {};
        news_configs.forEach(config => {
           if (config.model) initialNewsModels[config.id] = [config.model];
        });
        // We'll merge these into configModels or keep separate - let's merge
        
        // Initialize models for existing script configs
        const initialModels: Record<string, string[]> = { ...initialNewsModels };
        (data.script_configs || []).forEach(config => {
          if (config.model) {
            initialModels[config.id] = [config.model];
          }
        });
        setConfigModels(initialModels);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleChange = (field: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
    
    if (field === 'gemini_api_key') {
        setVerifiedModels([]); 
        setGeminiError(null);
    }
    if (field === 'newsapi_api_key') {
        setNewsApiSuccess(false);
        setNewsApiError(null);
    }
  };

  const handleNewsConfigChange = (id: string, field: keyof NewsConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      news_configs: prev.news_configs?.map(c => 
        c.id === id ? { ...c, [field]: value } : c
      )
    }));
    if (field === 'api_key') {
      setConfigErrors(prev => ({ ...prev, [id]: '' }));
    }
  };

  const addNewsConfig = () => {
    const newConfig: NewsConfig = {
      id: Math.random().toString(36).substr(2, 9),
      provider: 'newsapi',
      api_key: '',
      is_default: (settings.news_configs?.length || 0) === 0,
      nickname: `News Source ${(settings.news_configs?.length || 0) + 1}`
    };
    setSettings(prev => ({
      ...prev,
      news_configs: [...(prev.news_configs || []), newConfig]
    }));
  };

  const deleteNewsConfig = (id: string) => {
    setSettings(prev => {
      const filtered = (prev.news_configs || []).filter(c => c.id !== id);
      if (filtered.length > 0 && !filtered.find(c => c.is_default)) {
        filtered[0].is_default = true;
      }
      return { ...prev, news_configs: filtered };
    });
  };

  const setDefaultNewsConfig = (id: string) => {
    setSettings(prev => {
      const newConfigs = (prev.news_configs || []).map(c => ({
        ...c,
        is_default: c.id === id
      }));
      const defaultOne = newConfigs.find(c => c.id === id);
      return {
        ...prev,
        news_configs: newConfigs,
        // Also sync top-level fields for backend compatibility
        news_provider: defaultOne?.provider || prev.news_provider,
        news_api_key: defaultOne?.api_key || prev.news_api_key,
        news_model: defaultOne?.model || prev.news_model,
        news_nickname: defaultOne?.nickname || prev.news_nickname
      };
    });
  };

  const handleVerifyNewsKey = async (config: NewsConfig) => {
    setVerifyingConfigId(config.id);
    setConfigErrors(prev => ({ ...prev, [config.id]: '' }));
    try {
      if (config.provider === 'gemini') {
        const result = await verifyGemini(config.api_key);
        setConfigModels(prev => ({ ...prev, [config.id]: result.models }));
        if (result.models.length > 0 && !config.model) {
          handleNewsConfigChange(config.id, 'model', result.models[0]);
        }
      } else {
        await verifyNewsAPI(config.api_key);
        // NewsAPI doesn't return models, but we mark as verified
        setConfigModels(prev => ({ ...prev, [config.id]: ['standard'] }));
      }
    } catch (err: any) {
      setConfigErrors(prev => ({ ...prev, [config.id]: 'Verification failed. Please check your key.' }));
    } finally {
      setVerifyingConfigId(null);
    }
  };

  const handleScriptConfigChange = (id: string, field: keyof ScriptConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      script_configs: prev.script_configs?.map(c => 
        c.id === id ? { ...c, [field]: value } : c
      )
    }));
    if (field === 'api_key') {
      setConfigErrors(prev => ({ ...prev, [id]: '' }));
    }
  };

  const addScriptConfig = () => {
    const newConfig: ScriptConfig = {
      id: Math.random().toString(36).substr(2, 9),
      provider: 'openai',
      model: '',
      api_key: '',
      is_default: (settings.script_configs?.length || 0) === 0,
      nickname: `Source ${(settings.script_configs?.length || 0) + 1}`
    };
    setSettings(prev => ({
      ...prev,
      script_configs: [...(prev.script_configs || []), newConfig]
    }));
  };

  const deleteScriptConfig = (id: string) => {
    setSettings(prev => {
      const filtered = (prev.script_configs || []).filter(c => c.id !== id);
      // If we deleted the default, set first remaining as default
      if (filtered.length > 0 && !filtered.find(c => c.is_default)) {
        filtered[0].is_default = true;
      }
      return { ...prev, script_configs: filtered };
    });
  };

  const setDefaultConfig = (id: string) => {
    setSettings(prev => {
      const newConfigs = (prev.script_configs || []).map(c => ({
        ...c,
        is_default: c.id === id
      }));
      const defaultOne = newConfigs.find(c => c.id === id);
      return {
        ...prev,
        script_configs: newConfigs,
        // Also sync top-level fields for backend compatibility
        script_provider: defaultOne?.provider || prev.script_provider,
        script_api_key: defaultOne?.api_key || prev.script_api_key,
        script_model: defaultOne?.model || prev.script_model
      };
    });
  };

  const handleVerifyScriptKey = async (config: ScriptConfig) => {
    setVerifyingConfigId(config.id);
    setConfigErrors(prev => ({ ...prev, [config.id]: '' }));
    try {
      let result;
      if (config.provider === 'openai') {
        result = await verifyOpenAI(config.api_key);
      } else if (config.provider === 'gemini') {
        result = await verifyGemini(config.api_key);
      } else if (config.provider === 'anthropic') {
        result = await verifyAnthropic(config.api_key);
      } else {
        throw new Error('Unsupported provider');
      }

      setConfigModels(prev => ({ ...prev, [config.id]: result.models }));
      if (result.models.length > 0 && !config.model) {
        handleScriptConfigChange(config.id, 'model', result.models[0]);
      }
    } catch (err: any) {
      setConfigErrors(prev => ({ ...prev, [config.id]: 'Verification failed. Please check your key.' }));
    } finally {
      setVerifyingConfigId(null);
    }
  };

  const handleVerifyGemini = async () => {
    setIsVerifyingGemini(true);
    setGeminiError(null);
    try {
        const keyToUse = settings.gemini_api_key || settings.news_api_key;
        if (!keyToUse) return;
        
        const result = await verifyGemini(keyToUse);
        setVerifiedModels(result.models);
        // Auto-select first model if none selected
        if (!settings.news_model && result.models.length > 0) {
            handleChange('news_model', result.models[0]);
        }
    } catch (err: any) {
        setGeminiError('Verification failed. Please check your API key.');
        console.error(err);
    } finally {
        setIsVerifyingGemini(false);
    }
  };

  const handleVerifyNewsAPI = async () => {
    setIsVerifyingNewsAPI(true);
    setNewsApiError(null);
    setNewsApiSuccess(false);
    try {
        const keyToUse = settings.newsapi_api_key || settings.news_api_key;
        if (!keyToUse) return;

        await verifyNewsAPI(keyToUse);
        setNewsApiSuccess(true);
    } catch (err: any) {
        setNewsApiError('Verification failed. Key invalid.');
        console.error(err);
    } finally {
        setIsVerifyingNewsAPI(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#000000]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] font-sans py-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 text-center sm:text-left border-b border-slate-800 pb-10">
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl mb-3">
            Settings
          </h1>
          <p className="text-lg text-slate-400 font-medium">
            Configure your API providers and keys for the production pipeline.
          </p>
        </header>

        <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
          <div className="p-10 border-b border-slate-800 bg-[#0d1017]">
            <h2 className="text-xl font-bold text-white flex items-center">
              <Key className="w-5 h-5 mr-3 text-blue-500" />
              API Configuration
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Set up individual API keys for each stage of the news-to-video process.
            </p>
          </div>

          <div className="p-10 space-y-10">
            {/* News Collection Source */}
            <div className="bg-[#0d1117] rounded-2xl p-8 border border-slate-800">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-white flex items-center">
                  <span className="bg-blue-900/40 text-blue-400 p-2 rounded-xl mr-4 border border-blue-800/30">📰</span>
                  News Collection Source
                </h3>
                <button 
                  onClick={addNewsConfig}
                  className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-700"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add News Source
                </button>
              </div>

              <div className="space-y-6">
                {settings.news_configs && settings.news_configs.length > 0 ? (
                  settings.news_configs.map((config, idx) => (
                    <div key={config.id} className={`p-6 rounded-2xl border ${config.is_default ? 'border-blue-500/50 bg-blue-900/5' : 'border-slate-800 bg-slate-900/20'} transition-all`}>
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-4">
                           <div className={`p-2 rounded-lg ${
                             config.provider === 'newsapi' ? 'bg-blue-900/20 text-blue-400 border border-blue-800/30' :
                             'bg-indigo-900/20 text-indigo-400 border border-indigo-800/30'
                           }`}>
                             {config.provider === 'newsapi' ? <Sparkles className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                           </div>
                           <div>
                             <div className="flex items-center">
                               <h4 className="font-bold text-white text-base mr-3">{config.nickname || `Source ${idx + 1}`}</h4>
                               {config.is_default && (
                                 <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase">
                                   <Star className="w-2.5 h-2.5 mr-1 fill-current" /> Default
                                 </span>
                               )}
                             </div>
                             <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
                               {config.provider === 'gemini' ? 'Google Gemini (AI Agent)' : config.provider.toUpperCase()} {config.model ? `• ${config.model}` : ''}
                             </p>
                           </div>
                        </div>
                        <div className="flex space-x-2">
                           <button 
                             onClick={() => setDefaultNewsConfig(config.id)}
                             disabled={config.is_default}
                             className={`p-2 rounded-lg border transition-all ${config.is_default ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : 'border-slate-800 text-slate-500 hover:text-white hover:bg-slate-800'}`}
                             title="Set as Default"
                           >
                             <Star className={`w-4 h-4 ${config.is_default ? 'fill-current' : ''}`} />
                           </button>
                           <button 
                             onClick={() => deleteNewsConfig(config.id)}
                             className="p-2 rounded-lg border border-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-900/20 hover:border-red-900/30 transition-all"
                             title="Delete Configuration"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">PROVIDER</label>
                          <select 
                            value={config.provider}
                            onChange={(e) => handleNewsConfigChange(config.id, 'provider', e.target.value)}
                            className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                          >
                            <option value="newsapi">NewsAPI</option>
                            <option value="gemini">Google Gemini (AI Agent)</option>
                            <option value="bing">Bing News</option>
                            <option value="gnews">GNews</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">API KEY</label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={config.api_key}
                              onChange={(e) => handleNewsConfigChange(config.id, 'api_key', e.target.value)}
                              placeholder={`Enter ${config.provider} API KEY`}
                              className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                            />
                            <button
                              onClick={() => handleVerifyNewsKey(config)}
                              disabled={!config.api_key || verifyingConfigId === config.id}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap transition-all"
                            >
                              {verifyingConfigId === config.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify Key'}
                            </button>
                          </div>
                        </div>
                        
                        {config.provider === 'gemini' && (configModels[config.id] || []).length > 0 && (
                          <div className="md:col-span-1 animate-in fade-in slide-in-from-top-2">
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">SELECT MODEL</label>
                             <select 
                               value={config.model || ''}
                               onChange={(e) => handleNewsConfigChange(config.id, 'model', e.target.value)}
                               className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                             >
                               <option value="">Select Model</option>
                               {configModels[config.id].map(m => <option key={m} value={m}>{m}</option>)}
                             </select>
                          </div>
                        )}
                        
                        <div className={(config.provider === 'gemini' && (configModels[config.id] || []).length > 0) ? 'md:col-span-2' : 'md:col-span-3'}>
                           <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">NICKNAME (OPTIONAL)</label>
                           <input
                             type="text"
                             value={config.nickname || ''}
                             onChange={(e) => handleNewsConfigChange(config.id, 'nickname', e.target.value)}
                             placeholder="E.g. Primary News Agent"
                             className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                           />
                        </div>
                      </div>

                      {configErrors[config.id] && (
                        <p className="mt-3 text-xs text-red-400 flex items-center font-medium">
                          <AlertCircle className="w-3.5 h-3.5 mr-1.5" /> {configErrors[config.id]}
                        </p>
                      )}
                      
                      {configModels[config.id] && !configErrors[config.id] && (
                         <p className="mt-3 text-xs text-emerald-400 flex items-center font-bold">
                           <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> {config.provider === 'gemini' ? 'Key Verified & Models Loaded' : 'Key Verified'}
                         </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
                    <p className="text-slate-500 text-sm">No news collection sources configured.</p>
                    <button 
                      onClick={addNewsConfig}
                      className="mt-4 inline-flex items-center text-blue-400 hover:text-blue-300 text-xs font-bold transition-all"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Click to add your first news source
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Script Generation Model */}
            <div className="bg-[#0d1117] rounded-2xl p-8 border border-slate-800">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-bold text-white flex items-center">
                  <span className="bg-purple-900/40 text-purple-400 p-2 rounded-xl mr-4 border border-purple-800/30">📝</span>
                  Script Generation Model
                </h3>
                <button 
                  onClick={addScriptConfig}
                  className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all border border-slate-700"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Script Generation Model
                </button>
              </div>

              <div className="space-y-6">
                {settings.script_configs && settings.script_configs.length > 0 ? (
                  settings.script_configs.map((config, idx) => (
                    <div key={config.id} className={`p-6 rounded-2xl border ${config.is_default ? 'border-blue-500/50 bg-blue-900/5' : 'border-slate-800 bg-slate-900/20'} transition-all`}>
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-4">
                           <div className={`p-2 rounded-lg ${
                             config.provider === 'openai' ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/30' :
                             config.provider === 'anthropic' ? 'bg-orange-900/20 text-orange-400 border border-orange-800/30' :
                             'bg-blue-900/20 text-blue-400 border border-blue-800/30'
                           }`}>
                             {config.provider === 'openai' && <Sparkles className="w-5 h-5" />}
                             {config.provider === 'anthropic' && <ShieldCheck className="w-5 h-5" />}
                             {config.provider === 'gemini' && <CheckCircle className="w-5 h-5" />}
                           </div>
                           <div>
                             <div className="flex items-center">
                               <h4 className="font-bold text-white text-base mr-3">{config.nickname || `Source ${idx + 1}`}</h4>
                               {config.is_default && (
                                 <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase">
                                   <Star className="w-2.5 h-2.5 mr-1 fill-current" /> Default
                                 </span>
                               )}
                             </div>
                             <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-bold">
                               {config.provider} {config.model ? `• ${config.model}` : ''}
                             </p>
                           </div>
                        </div>
                        <div className="flex space-x-2">
                           <button 
                             onClick={() => setDefaultConfig(config.id)}
                             disabled={config.is_default}
                             className={`p-2 rounded-lg border transition-all ${config.is_default ? 'border-blue-500/50 text-blue-400 bg-blue-500/10' : 'border-slate-800 text-slate-500 hover:text-white hover:bg-slate-800'}`}
                             title="Set as Default"
                           >
                             <Star className={`w-4 h-4 ${config.is_default ? 'fill-current' : ''}`} />
                           </button>
                           <button 
                             onClick={() => deleteScriptConfig(config.id)}
                             className="p-2 rounded-lg border border-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-900/20 hover:border-red-900/30 transition-all"
                             title="Delete Configuration"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">PROVIDER</label>
                          <select 
                            value={config.provider}
                            onChange={(e) => handleScriptConfigChange(config.id, 'provider', e.target.value)}
                            className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                          >
                            <option value="openai">OpenAI (ChatGPT)</option>
                            <option value="anthropic">Anthropic (Claude)</option>
                            <option value="gemini">Google Gemini</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">API KEY</label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={config.api_key}
                              onChange={(e) => handleScriptConfigChange(config.id, 'api_key', e.target.value)}
                              placeholder={`Enter ${config.provider} API KEY`}
                              className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                            />
                            <button
                              onClick={() => handleVerifyScriptKey(config)}
                              disabled={!config.api_key || verifyingConfigId === config.id}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap transition-all"
                            >
                              {verifyingConfigId === config.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify Key'}
                            </button>
                          </div>
                        </div>
                        
                        {(configModels[config.id] || []).length > 0 && (
                          <div className="md:col-span-1 animate-in fade-in slide-in-from-top-2">
                             <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">MODEL</label>
                             <select 
                               value={config.model}
                               onChange={(e) => handleScriptConfigChange(config.id, 'model', e.target.value)}
                               className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                             >
                               <option value="">Select Model</option>
                               {configModels[config.id].map(m => <option key={m} value={m}>{m}</option>)}
                             </select>
                          </div>
                        )}
                        
                        <div className={(configModels[config.id] || []).length > 0 ? 'md:col-span-2' : 'md:col-span-3'}>
                           <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">NICKNAME (OPTIONAL)</label>
                           <input
                             type="text"
                             value={config.nickname || ''}
                             onChange={(e) => handleScriptConfigChange(config.id, 'nickname', e.target.value)}
                             placeholder="E.g. GPT-4o Production"
                             className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white text-sm p-3 border focus:border-blue-500 transition-all"
                           />
                        </div>
                      </div>

                      {configErrors[config.id] && (
                        <p className="mt-3 text-xs text-red-400 flex items-center font-medium">
                          <AlertCircle className="w-3.5 h-3.5 mr-1.5" /> {configErrors[config.id]}
                        </p>
                      )}
                      
                      {configModels[config.id] && !configErrors[config.id] && (
                         <p className="mt-3 text-xs text-emerald-400 flex items-center font-bold">
                           <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Key Verified & Models Loaded
                         </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-dashed border-slate-800">
                    <p className="text-slate-500 text-sm">No script generation models configured.</p>
                    <button 
                      onClick={addScriptConfig}
                      className="mt-4 inline-flex items-center text-blue-400 hover:text-blue-300 text-xs font-bold transition-all"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Click to add your first configuration
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Video Generation Engine */}
            <div className="bg-[#0d1117] rounded-2xl p-8 border border-slate-800">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center">
                <span className="bg-emerald-900/40 text-emerald-400 p-2 rounded-xl mr-4 border border-emerald-800/30">🎬</span>
                Video Generation Engine
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">PROVIDER</label>
                  <select 
                    value={settings.video_provider}
                    onChange={(e) => handleChange('video_provider', e.target.value)}
                    className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border transition-all"
                  >
                    <option value="">Select Provider</option>
                    <option value="minimax">MiniMax (Hailuo AI)</option>
                    <option value="runway">Runway Gen-3</option>
                    <option value="luma">Luma Dream Machine</option>
                    <option value="invideo">InVideo AI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">API KEY</label>
                  <input
                    type="password"
                    value={settings.video_api_key}
                    onChange={(e) => handleChange('video_api_key', e.target.value)}
                    placeholder="Enter Video API Key"
                    className="block w-full rounded-xl bg-slate-900 border-slate-700 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-10 bg-[#0d1017] border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center">
              {success && (
                <p className="text-emerald-400 font-bold flex items-center animate-in fade-in slide-in-from-left-2 transition-all">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Configurations saved successfully!
                </p>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-8 py-3 bg-blue-600 text-white rounded-2xl text-base font-bold hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-3" />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
