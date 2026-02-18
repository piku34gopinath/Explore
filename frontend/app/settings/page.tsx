"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Loader2, Youtube, Instagram, Facebook, Twitter } from "lucide-react";

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
  const [instagramConfig, setInstagramConfig] = useState<{ is_connected: boolean, accounts?: any[] } | null>(null);
  const [facebookConfig, setFacebookConfig] = useState<{ is_connected: boolean, accounts?: any[] } | null>(null);
  const [xConfig, setXConfig] = useState<{ is_connected: boolean, accounts?: any[] } | null>(null);

  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [instagramClientId, setInstagramClientId] = useState("");
  const [instagramClientSecret, setInstagramClientSecret] = useState("");
  const [facebookClientId, setFacebookClientId] = useState("");
  const [facebookClientSecret, setFacebookClientSecret] = useState("");
  const [xClientId, setXClientId] = useState("");
  const [xClientSecret, setXClientSecret] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Configure axios to send cookies
  axios.defaults.withCredentials = true;

  useEffect(() => {
    fetchConfigs();
    fetchSocialStatuses();
    fetchSystemConfigs();
  }, []);

  const fetchSocialStatuses = () => {
    fetchYoutubeStatus();
    fetchInstagramStatus();
    fetchFacebookStatus();
    fetchXStatus();
  };

  const fetchSystemConfigs = async () => {
    try {
        const platformKeys = [
            { id: "google_client_id", secret: "google_client_secret", setId: setGoogleClientId, setSecret: setGoogleClientSecret },
            { id: "instagram_client_id", secret: "instagram_client_secret", setId: setInstagramClientId, setSecret: setInstagramClientSecret },
            { id: "facebook_client_id", secret: "facebook_client_secret", setId: setFacebookClientId, setSecret: setFacebookClientSecret },
            { id: "x_client_id", secret: "x_client_secret", setId: setXClientId, setSecret: setXClientSecret }
        ];

        for (const platform of platformKeys) {
            const idRes = await axios.get(`${API_URL}/settings/system/${platform.id}`);
            if (idRes.data.value) platform.setId(idRes.data.value);
            
            const secretRes = await axios.get(`${API_URL}/settings/system/${platform.secret}`);
            if (secretRes.data.value) platform.setSecret(secretRes.data.value);
        }
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

  const fetchInstagramStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/instagram/status`);
      setInstagramConfig(response.data);
    } catch (err) {
      console.error("Error fetching Instagram status:", err);
    }
  };

  const fetchFacebookStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/facebook/status`);
      setFacebookConfig(response.data);
    } catch (err) {
      console.error("Error fetching Facebook status:", err);
    }
  };

  const fetchXStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/x/status`);
      setXConfig(response.data);
    } catch (err) {
      console.error("Error fetching X status:", err);
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

  const handleConnectSocial = async (platform: string) => {
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/auth/${platform}/url`);
      window.location.href = response.data.auth_url;
    } catch (err: any) {
      console.error(`Error getting ${platform} auth URL:`, err);
      setError(err.response?.data?.detail || `Failed to initiate ${platform} connection.`);
    }
  };

  const handleDisconnectSocial = async (platform: string, accountId: number) => {
    if (!confirm(`Are you sure you want to disconnect this ${platform} account?`)) return;
    try {
      await axios.delete(`${API_URL}/auth/${platform}/accounts/${accountId}`);
      fetchSocialStatuses();
    } catch (err) {
      console.error(`Error disconnecting ${platform}:`, err);
      setError(`Failed to disconnect ${platform} account.`);
    }
  };

  const handleSetPrimarySocialAccount = async (platform: string, accountId: number) => {
    try {
      await axios.post(`${API_URL}/auth/${platform}/accounts/${accountId}/set-primary`);
      fetchSocialStatuses();
    } catch (err: any) {
      console.error(`Error setting primary ${platform}:`, err);
      setError(err.response?.data?.detail || `Failed to set primary ${platform} account.`);
    }
  };

  const handleSaveSystemConfig = async () => {
    try {
        const configs = [
            { key: "google_client_id", value: googleClientId },
            { key: "google_client_secret", value: googleClientSecret },
            { key: "instagram_client_id", value: instagramClientId },
            { key: "instagram_client_secret", value: instagramClientSecret },
            { key: "facebook_client_id", value: facebookClientId },
            { key: "facebook_client_secret", value: facebookClientSecret },
            { key: "x_client_id", value: xClientId },
            { key: "x_client_secret", value: xClientSecret }
        ];

        for (const config of configs) {
            await axios.post(`${API_URL}/settings/system`, config);
        }
        alert("Platform Configurations Saved!");
    } catch (err) {
        console.error("Error saving system config:", err);
        setError("Failed to save platform settings.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your AI and YouTube integrations.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Row 1 Left: YouTube Integration */}
        <Card>
          <CardHeader>
            <CardTitle>YouTube Integration</CardTitle>
            <CardDescription>Connect multiple YouTube accounts to upload Shorts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : youtubeConfig?.is_connected ? (
              <div className="space-y-4">
                {youtubeConfig.accounts && youtubeConfig.accounts.length > 0 ? (
                  <>
                    {youtubeConfig.accounts.map((account: any) => (
                      <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg gap-4">
                        <div className="flex items-center gap-4 min-w-0 overflow-hidden">
                          {account.channel_thumbnail && (
                            <img 
                              src={account.channel_thumbnail} 
                              alt={account.channel_name} 
                              className="h-12 w-12 rounded-full flex-shrink-0" 
                            />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{account.channel_name}</h3>
                              {account.is_primary && (
                                <Badge variant="secondary" className="text-xs flex-shrink-0">PRIMARY</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {account.subscriber_count?.toLocaleString()} subscribers • {account.video_count?.toLocaleString()} videos
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!account.is_primary && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleSetPrimarySocialAccount("youtube", account.id)}
                            >
                              Set Primary
                            </Button>
                          )}
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => handleDisconnectSocial("youtube", account.id)}
                          >
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button 
                      className="w-full" 
                      variant="outline" 
                      onClick={() => handleConnectSocial("youtube")}
                    >
                      <Youtube className="h-4 w-4 mr-2" />
                      Add Another Account
                    </Button>
                  </>
                ) : (
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
                        onClick={() => handleDisconnectSocial("youtube", (youtubeConfig as any).id)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button className="w-full" onClick={() => handleConnectSocial("youtube")}>
                <Youtube className="h-4 w-4 mr-2" />
                Connect YouTube Account
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Row 1 Right: X (Twitter) Integration */}
        <Card>
          <CardHeader>
            <CardTitle>X Integration</CardTitle>
            <CardDescription>Connect X accounts to post videos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {xConfig?.is_connected ? (
              <div className="space-y-4">
                {xConfig.accounts?.map((account: any) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg gap-4">
                    <div className="flex items-center gap-4 min-w-0 overflow-hidden">
                      {account.profile_image_url && (
                        <img src={account.profile_image_url} alt={account.username} className="h-12 w-12 rounded-full flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">@{account.username}</h3>
                          {account.is_primary && <Badge variant="secondary" className="text-xs flex-shrink-0">PRIMARY</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{account.follower_count?.toLocaleString()} followers</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!account.is_primary && (
                        <Button variant="outline" size="sm" onClick={() => handleSetPrimarySocialAccount("x", account.id)}>Set Primary</Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleDisconnectSocial("x", account.id)}>Disconnect</Button>
                    </div>
                  </div>
                ))}
                <Button className="w-full" variant="outline" onClick={() => handleConnectSocial("x")}>
                  <Twitter className="h-4 w-4 mr-2" /> Add Another Account
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={() => handleConnectSocial("x")}>
                <Twitter className="h-4 w-4 mr-2" /> Connect X Account
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Row 2 Left: Facebook Integration */}
        <Card>
          <CardHeader>
            <CardTitle>Facebook Integration</CardTitle>
            <CardDescription>Connect Facebook Pages to post Reels.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {facebookConfig?.is_connected ? (
              <div className="space-y-4">
                {facebookConfig.accounts?.map((account: any) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg gap-4">
                    <div className="flex items-center gap-4 min-w-0 overflow-hidden">
                      {account.page_thumbnail && (
                        <img src={account.page_thumbnail} alt={account.page_name} className="h-12 w-12 rounded-full flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{account.page_name}</h3>
                          {account.is_primary && <Badge variant="secondary" className="text-xs flex-shrink-0">PRIMARY</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{account.fan_count?.toLocaleString()} likes</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!account.is_primary && (
                        <Button variant="outline" size="sm" onClick={() => handleSetPrimarySocialAccount("facebook", account.id)}>Set Primary</Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleDisconnectSocial("facebook", account.id)}>Disconnect</Button>
                    </div>
                  </div>
                ))}
                <Button className="w-full" variant="outline" onClick={() => handleConnectSocial("facebook")}>
                  <Facebook className="h-4 w-4 mr-2" /> Add Another Page
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={() => handleConnectSocial("facebook")}>
                <Facebook className="h-4 w-4 mr-2" /> Connect Facebook Page
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Row 2 Right: Instagram Integration */}
        <Card>
          <CardHeader>
            <CardTitle>Instagram Integration</CardTitle>
            <CardDescription>Connect Instagram accounts to post Reels.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {instagramConfig?.is_connected ? (
              <div className="space-y-4">
                {instagramConfig.accounts?.map((account: any) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg gap-4">
                    <div className="flex items-center gap-4 min-w-0 overflow-hidden">
                      {account.profile_picture && (
                        <img src={account.profile_picture} alt={account.username} className="h-12 w-12 rounded-full flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{account.username}</h3>
                          {account.is_primary && <Badge variant="secondary" className="text-xs flex-shrink-0">PRIMARY</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{account.follower_count?.toLocaleString()} followers</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!account.is_primary && (
                        <Button variant="outline" size="sm" onClick={() => handleSetPrimarySocialAccount("instagram", account.id)}>Set Primary</Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleDisconnectSocial("instagram", account.id)}>Disconnect</Button>
                    </div>
                  </div>
                ))}
                <Button className="w-full" variant="outline" onClick={() => handleConnectSocial("instagram")}>
                  <Instagram className="h-4 w-4 mr-2" /> Add Another Account
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={() => handleConnectSocial("instagram")}>
                <Instagram className="h-4 w-4 mr-2" /> Connect Instagram Account
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Row 3 Left: Add New Provider */}
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

        {/* Row 3 Right: Active Configurations */}
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

        {/* Full Width Bottom: Platform Configuration */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Platform Configuration</CardTitle>
            <CardDescription>Configure API credentials for social platforms.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Instagram className="h-4 w-4" /> Instagram Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client ID</label>
                  <Input value={instagramClientId} onChange={(e) => setInstagramClientId(e.target.value)} placeholder="Instagram Client ID" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client Secret</label>
                  <Input type="password" value={instagramClientSecret} onChange={(e) => setInstagramClientSecret(e.target.value)} placeholder="Instagram Client Secret" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Facebook className="h-4 w-4" /> Facebook Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client ID</label>
                  <Input value={facebookClientId} onChange={(e) => setFacebookClientId(e.target.value)} placeholder="Facebook Client ID" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client Secret</label>
                  <Input type="password" value={facebookClientSecret} onChange={(e) => setFacebookClientSecret(e.target.value)} placeholder="Facebook Client Secret" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Twitter className="h-4 w-4" /> X (Twitter) Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client ID</label>
                  <Input value={xClientId} onChange={(e) => setXClientId(e.target.value)} placeholder="X Client ID" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Client Secret</label>
                  <Input type="password" value={xClientSecret} onChange={(e) => setXClientSecret(e.target.value)} placeholder="X Client Secret" />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSaveSystemConfig}>
              Save Platform Configurations
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
