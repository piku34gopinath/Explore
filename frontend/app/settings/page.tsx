"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2, Youtube } from "lucide-react";

export default function SettingsPage() {
  const [provider, setProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState<string>("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<any[]>([]);
  const [youtubeConfig, setYoutubeConfig] = useState<{ is_connected: boolean, accounts?: any[], channel_name?: string, channel_thumbnail?: string, subscriber_count?: number, video_count?: number } | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Configure axios to send cookies
  axios.defaults.withCredentials = true;

  useEffect(() => {
    fetchConfigs();
    fetchYoutubeStatus();
    fetchSystemConfigs();
  }, []);

  const fetchSystemConfigs = async () => {
    try {
        const idRes = await axios.get(`${API_URL}/settings/system/google_client_id`);
        if (idRes.data.value) setGoogleClientId(idRes.data.value);
        
        const secretRes = await axios.get(`${API_URL}/settings/system/google_client_secret`);
        if (secretRes.data.value) setGoogleClientSecret(secretRes.data.value);
    } catch (err) {
        console.error("Error fetching system configs:", err);
    }
  };

  const [statusLoading, setStatusLoading] = useState(true);

  const fetchYoutubeStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await axios.get(`${API_URL}/auth/youtube/status`);
      setYoutubeConfig(response.data);
    } catch (err) {
      console.error("Error fetching YouTube status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchConfigs = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings/ai`);
      setSavedConfigs(response.data);
    } catch (err) {
      console.error("Error fetching configs:", err);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    setVerified(false);
    try {
      const response = await axios.post(`${API_URL}/settings/ai/verify`, {
        provider,
        api_key: apiKey
      });
      setModels(response.data.available_models);
      setSelectedModel(response.data.available_models[0] || "");
      setVerified(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Verification failed. Check your key.");
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(`${API_URL}/settings/ai/save`, {
        provider,
        api_key: apiKey,
        selected_model: selectedModel
      });
      fetchConfigs();
      setApiKey("");
      setVerified(false);
      setModels([]);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (configId: number) => {
    try {
      await axios.post(`${API_URL}/settings/ai/${configId}/activate`);
      fetchConfigs();
    } catch (err) {
      console.error("Error activating config:", err);
      setError("Failed to activate configuration.");
    }
  };

  const handleConnectYoutube = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/youtube/url`);
      window.location.href = response.data.auth_url;
    } catch (err) {
      console.error("Error getting auth URL:", err);
      setError("Failed to initiate YouTube connection.");
    }
  };

  const handleDisconnectYoutube = async (accountId?: number) => {
    if (!confirm("Are you sure you want to disconnect this YouTube account?")) return;
    
    try {
      if (accountId) {
        await axios.delete(`${API_URL}/auth/youtube/accounts/${accountId}`);
      } else {
        await axios.post(`${API_URL}/auth/youtube/disconnect`);
      }
      fetchYoutubeStatus();
    } catch (err) {
      console.error("Error disconnecting YouTube:", err);
      setError("Failed to disconnect YouTube account.");
    }
  };

  const handleSetPrimaryAccount = async (accountId: number) => {
    try {
      await axios.post(`${API_URL}/auth/youtube/accounts/${accountId}/set-primary`);
      fetchYoutubeStatus();
    } catch (err: any) {
      console.error("Error setting primary:", err);
      setError(err.response?.data?.detail || "Failed to set primary account.");
    }
  };

  const handleSaveSystemConfig = async () => {
    try {
        await axios.post(`${API_URL}/settings/system`, { key: "google_client_id", value: googleClientId });
        await axios.post(`${API_URL}/settings/system`, { key: "google_client_secret", value: googleClientSecret });
        alert("Google App Configuration Saved!");
    } catch (err) {
        console.error("Error saving system config:", err);
        setError("Failed to save Google App settings.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your AI and YouTube integrations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          
          {/* YouTube Integration Card */}
          <Card>
            <CardHeader>
              <CardTitle>YouTube Integration</CardTitle>
              <CardDescription>Connect multiple YouTube accounts to upload Shorts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Show app config section only when no accounts are connected */}
              {!youtubeConfig?.is_connected && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/50 mb-4">
                      <h3 className="text-sm font-semibold">1. App Configuration (One-time setup)</h3>
                      <div className="space-y-2">
                          <label className="text-xs font-medium">Google Client ID</label>
                          <Input 
                              placeholder="xxxxxxxx.apps.googleusercontent.com" 
                              value={googleClientId}
                              onChange={(e) => setGoogleClientId(e.target.value)}
                          />
                      </div>
                      <div className="space-y-2">
                          <label className="text-xs font-medium">Google Client Secret</label>
                          <Input 
                              type="password"
                              placeholder="Required for OAuth" 
                              value={googleClientSecret}
                              onChange={(e) => setGoogleClientSecret(e.target.value)}
                          />
                      </div>
                      <Button variant="outline" size="sm" onClick={handleSaveSystemConfig}>
                          Save App Credentials
                      </Button>
                  </div>
              )}

              {statusLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : youtubeConfig?.is_connected ? (
                <div className="space-y-4">
                  {/* Display connected accounts */}
                  {youtubeConfig.accounts && youtubeConfig.accounts.length > 0 ? (
                    <>
                      {youtubeConfig.accounts.map((account: any) => (
                        <div key={account.id} className="flex items-center gap-4 p-4 border rounded-lg">
                          {account.channel_thumbnail && (
                            <img 
                              src={account.channel_thumbnail} 
                              alt={account.channel_name} 
                              className="h-12 w-12 rounded-full" 
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{account.channel_name}</h3>
                              {account.is_primary && (
                                <Badge variant="secondary" className="text-xs">PRIMARY</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {account.subscriber_count?.toLocaleString()} subscribers • {account.video_count?.toLocaleString()} videos
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!account.is_primary && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleSetPrimaryAccount(account.id)}
                              >
                                Set Primary
                              </Button>
                            )}
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => handleDisconnectYoutube(account.id)}
                            >
                              Disconnect
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button 
                        className="w-full" 
                        variant="outline" 
                        onClick={handleConnectYoutube}
                      >
                        <Youtube className="h-4 w-4 mr-2" />
                        Add Another Account
                      </Button>
                    </>
                  ) : (
                    /* Fallback for old single-account format */
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        {youtubeConfig.channel_thumbnail && (
                          <img 
                            src={youtubeConfig.channel_thumbnail} 
                            alt="Channel" 
                            className="h-12 w-12 rounded-full" 
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold">{youtubeConfig.channel_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {youtubeConfig.subscriber_count?.toLocaleString()} subscribers • {youtubeConfig.video_count?.toLocaleString()} videos
                          </p>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => handleDisconnectYoutube()}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button className="w-full" onClick={handleConnectYoutube}>
                  <Youtube className="h-4 w-4 mr-2" />
                  Connect YouTube Account
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add New Provider</CardTitle>
              <CardDescription>Configure a new AI provider to use for clipping.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">AI Provider</label>
                <Select value={provider} onValueChange={(val) => { setProvider(val); setVerified(false); setModels([]); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                    <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <div className="flex gap-2">
                  <Input 
                    type="password" 
                    placeholder="Enter your API key" 
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setVerified(false); }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={handleVerify} 
                    disabled={verifying || !apiKey}
                  >
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {verified && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <Alert className="bg-green-500/10 text-green-500 border-green-500/20">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>API Key verified successfully!</AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Model</label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button className="w-full" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Configuration
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Configs</CardTitle>
              <CardDescription>Click to activate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No configurations saved yet.</p>
              ) : (
                savedConfigs.map((config) => (
                  <div 
                    key={config.id} 
                    className={`p-3 border rounded-lg flex items-center justify-between transition-all ${
                      config.is_active 
                        ? "border-green-500/50 bg-green-500/5" 
                        : "hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                    }`}
                    onClick={() => !config.is_active && handleActivate(config.id)}
                  >
                    <div>
                      <p className="font-medium capitalize">{config.provider}</p>
                      <p className="text-xs text-muted-foreground">{config.selected_model}</p>
                    </div>
                    {config.is_active && (
                      <span className="h-2 w-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,1)]"></span>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
