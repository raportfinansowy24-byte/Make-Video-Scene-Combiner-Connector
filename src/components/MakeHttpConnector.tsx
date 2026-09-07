import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Video,
  Play,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  Settings,
  Zap,
  Code2,
  Server,
  Type,
  Music,
  ExternalLink,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Volume2,
  MonitorPlay,
  Film,
  Terminal,
  Activity,
  Gauge,
  Clock,
  Radio,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Webhook,
  Send,
  ArrowRight
} from 'lucide-react';
import { Scene, SystemHealth, JobStatusResponse, ToastItem } from '../types';
import { AiViralAutoPilot } from './AiViralAutoPilot';
import { RenderingQueue } from './RenderingQueue';
import { ToastContainer } from './Toast';


// Preset high quality public test video clips
const SAMPLE_CLIPS = [
  {
    name: '🔥 Ocean Waves',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  {
    name: '🌲 Nature Drone',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
  },
  {
    name: '🚀 Space Launch',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
  },
  {
    name: '🏙️ City Aerial',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyflights.mp4'
  }
];

// Preset background music tracks
const SAMPLE_MUSIC = [
  {
    name: '🎵 Upbeat Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  },
  {
    name: '🎧 Chill Beats',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  }
];

export const MakeHttpConnector: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'autopilot' | 'editor' | 'make' | 'n8n' | 'webhook' | 'jobs' | 'docs'>('autopilot');
  const [health, setHealth] = useState<SystemHealth | null>(null);

  const [healthLoading, setHealthLoading] = useState<boolean>(true);

  // Recent Server Jobs (from Make.com / API)
  const [recentJobs, setRecentJobs] = useState<JobStatusResponse[]>(() => {
    try {
      const cached = localStorage.getItem('rendering_jobs_history');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return [];
  });

  // Webhook Logs State
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [webhookTesting, setWebhookTesting] = useState<boolean>(false);

  const fetchRecentJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: JobStatusResponse[] = await res.json();
        setRecentJobs(data);
        try {
          localStorage.setItem('rendering_jobs_history', JSON.stringify(data));
        } catch {}
      }
    } catch (err) {
      console.warn('Błąd pobierania listy zadań:', err);
    }
  };

  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch('/api/webhook/logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Błąd pobierania logów webhooków:', err);
    }
  };

  const clearWebhookLogs = async () => {
    try {
      await fetch('/api/webhook/logs', { method: 'DELETE' });
      setWebhookLogs([]);
    } catch {}
  };

  useEffect(() => {
    fetchRecentJobs();
    fetchWebhookLogs();
    const interval = setInterval(() => {
      fetchRecentJobs();
      fetchWebhookLogs();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Connection mode preferences
  const [preferredMode, setPreferredMode] = useState<'sse' | 'polling'>('sse');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'sse' | 'polling'>('idle');

  // Scenes State
  const [scenes, setScenes] = useState<Scene[]>([
    {
      id: 'scene-1',
      videoUrl: SAMPLE_CLIPS[0].url,
      subtitles: 'KONEKTOR MAKE.COM - WIDEO Z NAPISAMI',
      trimStart: 0,
      trimEnd: 4,
      captionStyle: {
        fontSize: 42,
        fontColor: 'yellow',
        outlineColor: 'black',
        outlineWidth: 3,
        boxColor: 'black@0.6',
        position: 'bottom'
      }
    },
    {
      id: 'scene-2',
      videoUrl: SAMPLE_CLIPS[1].url,
      subtitles: 'CZCIONKA MONTSERRAT-BOLD.TTF',
      trimStart: 0,
      trimEnd: 4,
      captionStyle: {
        fontSize: 38,
        fontColor: 'white',
        outlineColor: 'black',
        outlineWidth: 3,
        boxColor: 'black@0.6',
        position: 'center'
      }
    }
  ]);

  // Global Settings
  const [outputResolution, setOutputResolution] = useState<string>('720x1280');
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState<string>('');
  const [audioVolume, setAudioVolume] = useState<number>(0.3);
  const [fps, setFps] = useState<number>(30);

  // Real-time Rendering State
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [currentJob, setCurrentJob] = useState<JobStatusResponse | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showLogsTerminal, setShowLogsTerminal] = useState<boolean>(true);

  // Copy state helpers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Toast Notifications State
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // References
  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch API Health
  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.warn('Health check error:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    return () => {
      cleanupRealtimeConnections();
    };
  }, []);

  // Auto-scroll log terminal
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [currentJob?.logs, showLogsTerminal]);

  const cleanupRealtimeConnections = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast('info', 'Skopiowano do schowka', 'Kod został pomyślnie skopiowany.');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const addScene = () => {
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      videoUrl: SAMPLE_CLIPS[scenes.length % SAMPLE_CLIPS.length].url,
      subtitles: `NOWA SCENA ${scenes.length + 1}`,
      trimStart: 0,
      trimEnd: 4,
      captionStyle: {
        fontSize: 40,
        fontColor: 'white',
        outlineColor: 'black',
        outlineWidth: 3,
        boxColor: 'black@0.6',
        position: 'bottom'
      }
    };
    setScenes([...scenes, newScene]);
  };

  const removeScene = (id: string) => {
    if (scenes.length <= 1) return;
    setScenes(scenes.filter((s) => s.id !== id));
  };

  const updateScene = (id: string, fields: Partial<Scene>) => {
    setScenes(
      scenes.map((s) => {
        if (s.id === id) {
          return { ...s, ...fields };
        }
        return s;
      })
    );
  };

  const updateCaptionStyle = (id: string, styleFields: Partial<Scene['captionStyle']>) => {
    setScenes(
      scenes.map((s) => {
        if (s.id === id) {
          return {
            ...s,
            captionStyle: { ...s.captionStyle, ...styleFields }
          };
        }
        return s;
      })
    );
  };

  // Start Real-Time Video Combination Task
  const handleStartRender = async () => {
    cleanupRealtimeConnections();
    setIsRendering(true);
    setRenderError(null);
    setRenderedVideoUrl(null);
    setCurrentJob(null);
    setElapsedSeconds(0);
    setConnectionStatus('idle');

    // Timer for elapsed seconds counter
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const payload = {
      scenes: scenes.map((s) => ({
        videoUrl: s.videoUrl,
        subtitles: s.subtitles,
        trimStart: s.trimStart,
        trimEnd: s.trimEnd,
        captionStyle: s.captionStyle
      })),
      audioUrl: backgroundMusicUrl || undefined,
      audioVolume: backgroundMusicUrl ? audioVolume : undefined,
      outputResolution,
      fps,
      async: true // Request async background processing for real-time tracking
    };

    try {
      const res = await fetch('/api/combine-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Błąd inicjalizacji renderowania');
      }

      const data = await res.json();
      const jobId = data.jobId;

      if (!jobId) {
        throw new Error('Serwer nie zwrócił poprawnego jobId');
      }

      addToast('success', 'Uruchomiono renderowanie', `Pomyślnie utworzono zadanie składania filmu (ID: ${jobId})`);

      // Initialize status
      setCurrentJob({
        id: jobId,
        status: 'processing',
        progress: 5,
        step: 'Rozpoczynanie połączonej sesji real-time...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Try SSE streaming first if preferred
      if (preferredMode === 'sse' && typeof window !== 'undefined' && 'EventSource' in window) {
        connectSSEStream(jobId);
      } else {
        startPollingStream(jobId);
      }
    } catch (err) {
      const msg = (err as Error).message || 'Nieoczekiwany błąd podczas wywołania API';
      setIsRendering(false);
      setRenderError(msg);
      addToast('error', 'Błąd uruchomienia renderowania', msg);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // SSE Real-time Subscription logic
  const connectSSEStream = (jobId: string) => {
    try {
      setConnectionStatus('sse');
      const sseUrl = `/api/jobs/${jobId}/stream`;
      console.log('⚡ Łączenie ze strumieniem SSE:', sseUrl);

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const jobData: JobStatusResponse = JSON.parse(event.data);
          setCurrentJob(jobData);

          if (jobData.status === 'completed') {
            handleJobFinished(jobData);
          } else if (jobData.status === 'failed') {
            handleJobFailed(jobData.error || 'Błąd wykonania komendy FFmpeg');
          }
        } catch (parseErr) {
          console.warn('Błąd parsowania zdarzenia SSE:', parseErr);
        }
      };

      es.onerror = (err) => {
        console.warn('⚠️ Przerwanie połączenia SSE stream. Przełączanie na szybkie odpytywanie HTTP...', err);
        es.close();
        eventSourceRef.current = null;
        // Fallback to high-frequency polling automatically
        startPollingStream(jobId);
      };
    } catch (err) {
      startPollingStream(jobId);
    }
  };

  // Fallback Polling stream logic (500ms interval)
  const startPollingStream = (jobId: string) => {
    setConnectionStatus('polling');
    console.log('🔄 Uruchamianie odpytywania HTTP 500ms dla zadania:', jobId);

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (res.ok) {
          const jobData: JobStatusResponse = await res.json();
          setCurrentJob(jobData);

          if (jobData.status === 'completed') {
            handleJobFinished(jobData);
          } else if (jobData.status === 'failed') {
            handleJobFailed(jobData.error || 'Błąd renderowania FFmpeg');
          }
        }
      } catch (pollErr) {
        console.warn('Poll fetch error:', pollErr);
      }
    };

    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 500);
  };

  const handleJobFinished = (job: JobStatusResponse) => {
    cleanupRealtimeConnections();
    setIsRendering(false);
    setRenderedVideoUrl(job.outputUrl || null);
    addToast('success', 'Wideo zmontowane!', 'Proces składania scen i wypalania napisów został pomyślnie zakończony.');
    fetchHealth();
  };

  const handleJobFailed = (errorMsg: string) => {
    cleanupRealtimeConnections();
    setIsRendering(false);
    setRenderError(errorMsg);
    addToast('error', 'Renderowanie nie powiodło się', errorMsg);
  };

  // Payload mode state: 'creator' (static test data), 'make_variables' (Make {{1.var}} syntax), 'make_array' (Make array mapping syntax)
  const [makePayloadMode, setMakePayloadMode] = useState<'creator' | 'make_variables' | 'make_array'>('creator');

  // Make.com Payload helper
  const getMakePayloadJSON = () => {
    if (makePayloadMode === 'make_variables') {
      return JSON.stringify(
        {
          scenes: scenes.map((s, i) => ({
            videoUrl: `{{1.scene_${i + 1}_videoUrl}}`,
            subtitles: `{{1.scene_${i + 1}_subtitles}}`,
            trimStart: s.trimStart || 0,
            trimEnd: s.trimEnd || 5,
            captionStyle: s.captionStyle
          })),
          audioUrl: '{{1.backgroundMusicUrl}}',
          audioVolume: 0.3,
          outputResolution,
          fps,
          async: true,
          webhookUrl: 'https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw'
        },
        null,
        2
      );
    }

    if (makePayloadMode === 'make_array') {
      return JSON.stringify(
        {
          scenes: '{{1.scenes}}',
          audioUrl: '{{1.audioUrl}}',
          audioVolume: 0.3,
          outputResolution,
          fps,
          async: true,
          webhookUrl: 'https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw'
        },
        null,
        2
      );
    }

    // Default 'creator' mode (static values for immediate test)
    return JSON.stringify(
      {
        scenes: scenes.map((s) => ({
          videoUrl: s.videoUrl,
          subtitles: s.subtitles,
          trimStart: s.trimStart || 0,
          trimEnd: s.trimEnd || 5,
          captionStyle: s.captionStyle
        })),
        audioUrl: backgroundMusicUrl || 'https://domain.com/background-music.mp3',
        audioVolume: 0.3,
        outputResolution,
        fps,
        async: true,
        webhookUrl: 'https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw'
      },
      null,
      2
    );
  };

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const appUrl = rawOrigin.replace('ais-dev-', 'ais-pre-');

  const getCurlCommand = () => {
    return `curl -X POST "${appUrl}/api/combine-scenes" \\
  -H "Content-Type: application/json" \\
  -d '${getMakePayloadJSON().replace(/\n/g, '')}'`;
  };

  const downloadMakeBlueprint = () => {
    const blueprint = {
      name: 'FFmpeg Video Scene Combiner Connector',
      description: 'Połączenie scen wideo z napisami Montserrat w Make.com',
      modules: [
        {
          id: 1,
          module: 'json:ParseJSON',
          version: 1,
          parameters: {}
        },
        {
          id: 2,
          module: 'http:ActionMakeRequest',
          version: 3,
          parameters: {
            url: `${appUrl}/api/combine-scenes`,
            method: 'POST',
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            bodyType: 'raw',
            contentType: 'application/json',
            body: getMakePayloadJSON()
          }
        }
      ]
    };

    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Make_VideoCombiner_Blueprint.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
                <Film className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                  Make.com HTTP Video Combiner
                </h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Automatyczne łączenie klipów, czcionka Montserrat-Bold i śledzenie postępu renderowania w czasie rzeczywistym
                </p>
              </div>
            </div>
          </div>

          {/* Environment Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2 text-xs">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">API:</span>
              <span className="text-emerald-400 font-medium">/api/combine-scenes</span>
            </div>

            <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2 text-xs">
              <Code2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-slate-400">FFmpeg:</span>
              {healthLoading ? (
                <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
              ) : health?.ffmpeg ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Aktywny
                </span>
              ) : (
                <span className="text-amber-400 font-medium">Sprawdzanie...</span>
              )}
            </div>

            <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2 text-xs">
              <Type className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Font:</span>
              {health?.fontStatus?.ready ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Montserrat-Bold.ttf
                </span>
              ) : (
                <span className="text-indigo-400 font-medium">Pobieranie...</span>
              )}
            </div>

            <button
              onClick={fetchHealth}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition"
              title="Odśwież stan serwera"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 mt-6 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('autopilot')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition border-b-2 whitespace-nowrap shadow-sm ${
              activeTab === 'autopilot'
                ? 'border-indigo-500 text-white bg-gradient-to-r from-indigo-600/30 to-purple-600/30 rounded-t-lg'
                : 'border-transparent text-indigo-300 hover:text-white hover:bg-indigo-950/40'
            }`}
          >
            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
            ⚡ AI Auto-Pilot Shorts
          </button>

          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Kreator Scen & Progress Bar
          </button>

          <button
            onClick={() => setActiveTab('make')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === 'make'
                ? 'border-purple-500 text-purple-400 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Zap className="w-4 h-4" />
            Konfiguracja Make.com (HTTP)
          </button>

          <button
            onClick={() => setActiveTab('n8n')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === 'n8n'
                ? 'border-orange-500 text-orange-400 bg-orange-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Szablon n8n Node
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 whitespace-nowrap ${
              activeTab === 'webhook'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Webhook className="w-4 h-4 text-indigo-400" />
            🪝 Centrum Webhooków
            {webhookLogs.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                {webhookLogs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 whitespace-nowrap ${
              activeTab === 'jobs'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            📡 Live Feed Zadań Make.com
            {recentJobs.some((j) => j.status === 'processing' || j.status === 'queued') && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition border-b-2 whitespace-nowrap ${
              activeTab === 'docs'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Dokumentacja API
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="max-w-7xl mx-auto">
        {/* TAB 0: AI AUTO-PILOT SHORTS */}
        {activeTab === 'autopilot' && (
          <AiViralAutoPilot
            onLoadScriptToEditor={(newScenes, musicUrl) => {
              setScenes(newScenes);
              if (musicUrl) setBackgroundMusicUrl(musicUrl);
              setActiveTab('editor');
            }}
            onJobStarted={(jobId) => {
              console.log('AutoPilot started job:', jobId);
            }}
            onToast={addToast}
          />
        )}

        {/* TAB 1: SCENE EDITOR & REAL-TIME PROGRESS */}
        {activeTab === 'editor' && (

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Scene Editor & Settings */}
            <div className="lg:col-span-7 space-y-6">
              {/* Global Settings Panel */}
              <div className="p-5 bg-slate-900/90 rounded-2xl border border-slate-800 backdrop-blur-sm">
                <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  Ustawienia Globalne Projektu
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Rozdzielczość Wyjściowa
                    </label>
                    <select
                      value={outputResolution}
                      onChange={(e) => setOutputResolution(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="720x1280">720x1280 (Pionowe 9:16 - 720p HD Domyślne / Szybki render)</option>
                      <option value="1080x1920">1080x1920 (Pionowe 9:16 - 1080p Full HD)</option>
                      <option value="1280x720">1280x720 (Poziome 16:9 - 720p HD)</option>
                      <option value="1920x1080">1920x1080 (Poziome 16:9 - 1080p Full HD)</option>
                      <option value="720x720">720x720 (Kwadrat 1:1 - 720p)</option>
                      <option value="1080x1080">1080x1080 (Kwadrat 1:1 - 1080p)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Klatki na sekundę (FPS)
                    </label>
                    <select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Płynne)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Muzyka w Tle (Audio URL)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://domena.pl/sciezka-do-audio.mp3"
                        value={backgroundMusicUrl}
                        onChange={(e) => setBackgroundMusicUrl(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      {backgroundMusicUrl && (
                        <div className="flex items-center gap-2 px-3 bg-slate-950 border border-slate-800 rounded-xl">
                          <Volume2 className="w-4 h-4 text-indigo-400" />
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.1"
                            value={audioVolume}
                            onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                            className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            title={`Głośność muzyki: ${Math.round(audioVolume * 100)}%`}
                          />
                          <span className="text-xs text-slate-400 w-8">{Math.round(audioVolume * 100)}%</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-500">Przykładowe audio:</span>
                      {SAMPLE_MUSIC.map((track, i) => (
                        <button
                          key={i}
                          onClick={() => setBackgroundMusicUrl(track.url)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                        >
                          {track.name}
                        </button>
                      ))}
                      {backgroundMusicUrl && (
                        <button
                          onClick={() => setBackgroundMusicUrl('')}
                          className="text-xs text-rose-400 hover:text-rose-300 ml-auto"
                        >
                          Usuń muzykę
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scene Builder Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    Sekwencja Scen Wideo ({scenes.length})
                  </h3>
                  <button
                    onClick={addScene}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition shadow-md shadow-indigo-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    Dodaj Scenę
                  </button>
                </div>

                {/* Scenes List */}
                <div className="space-y-4">
                  {scenes.map((scene, idx) => (
                    <div
                      key={scene.id}
                      className="p-5 bg-slate-900 border border-slate-800 rounded-2xl relative group transition hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-slate-200">Scena {idx + 1}</span>
                        </div>
                        {scenes.length > 1 && (
                          <button
                            onClick={() => removeScene(scene.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            title="Usuń scenę"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">URL Pliku Wideo / Obrazu</label>
                          <input
                            type="url"
                            value={scene.videoUrl}
                            onChange={(e) => updateScene(scene.id, { videoUrl: e.target.value })}
                            placeholder="https://.../video.mp4"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-2 mt-1.5 overflow-x-auto pb-1">
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">Przykłady:</span>
                            {SAMPLE_CLIPS.map((clip, i) => (
                              <button
                                key={i}
                                onClick={() => updateScene(scene.id, { videoUrl: clip.url })}
                                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md whitespace-nowrap transition"
                              >
                                {clip.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1 flex items-center justify-between">
                            <span>Napisy / Subtitles (Czcionka Montserrat)</span>
                            <span className="text-[11px] text-amber-400">Montserrat-Bold.ttf</span>
                          </label>
                          <input
                            type="text"
                            value={scene.subtitles}
                            onChange={(e) => updateScene(scene.id, { subtitles: e.target.value })}
                            placeholder="Wpisz tekst do nałożenia na wideo..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-bold focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Pozycja Napisu</label>
                            <select
                              value={scene.captionStyle.position || 'bottom'}
                              onChange={(e) =>
                                updateCaptionStyle(scene.id, { position: e.target.value as any })
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300"
                            >
                              <option value="bottom">Dół (Bottom)</option>
                              <option value="center">Środek (Center)</option>
                              <option value="top">Góra (Top)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Kolor Czcionki</label>
                            <select
                              value={scene.captionStyle.fontColor || 'white'}
                              onChange={(e) => updateCaptionStyle(scene.id, { fontColor: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300"
                            >
                              <option value="yellow">Żółty (#FFEA00)</option>
                              <option value="white">Biały (#FFFFFF)</option>
                              <option value="cyan">Błękitny (#00E5FF)</option>
                              <option value="lime">Limonkowy (#76FF03)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Start Klipu (s)</label>
                            <input
                              type="number"
                              min={0}
                              value={scene.trimStart ?? 0}
                              onChange={(e) => updateScene(scene.id, { trimStart: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Koniec Klipu (s)</label>
                            <input
                              type="number"
                              min={1}
                              value={scene.trimEnd ?? 4}
                              onChange={(e) => updateScene(scene.id, { trimEnd: parseFloat(e.target.value) || 4 })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Real-Time Progress Bar & Render Console */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl sticky top-6 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-indigo-400" />
                      Panel Real-Time Progress
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Przetwarzanie FFmpeg ze strumieniowaniem statusu
                    </p>
                  </div>

                  <button
                    onClick={handleStartRender}
                    disabled={isRendering}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-lg ${
                      isRendering
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:opacity-95 shadow-indigo-500/25 active:scale-95'
                    }`}
                  >
                    {isRendering ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Przetwarzanie...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        Uruchom Render
                      </>
                    )}
                  </button>
                </div>

                {/* Stream Protocol Mode Selector */}
                <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    Tryb Połączenia:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreferredMode('sse')}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                        preferredMode === 'sse'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      SSE Stream
                    </button>
                    <button
                      onClick={() => setPreferredMode('polling')}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                        preferredMode === 'polling'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Polling (500ms)
                    </button>
                  </div>
                </div>

                {/* Active Connection Indicator */}
                {isRendering && (
                  <div className="flex items-center justify-between text-xs px-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <span className="text-emerald-400 font-medium">
                        {connectionStatus === 'sse'
                          ? 'Strumień SSE Aktywny'
                          : connectionStatus === 'polling'
                          ? 'Odpytywanie Polling (500ms)'
                          : 'Inicjalizacja...'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{elapsedSeconds}s</span>
                    </div>
                  </div>
                )}

                {/* REAL-TIME PROGRESS BAR DISPLAY */}
                {currentJob && (
                  <div className="p-4 bg-slate-950 border border-indigo-500/30 rounded-2xl space-y-4 shadow-inner">
                    {/* Step & Progress % */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-xs font-semibold text-indigo-400 block mb-0.5">
                          {currentJob.step || 'Przetwarzanie FFmpeg'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {currentJob.id}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-mono">
                          {currentJob.progress}%
                        </span>
                      </div>
                    </div>

                    {/* Animated Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                      <motion.div
                        className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full rounded-full shadow-lg shadow-indigo-500/50"
                        initial={{ width: 0 }}
                        animate={{ width: `${currentJob.progress}%` }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Live Metrics Grid (Frames, FPS, Time, Speed) */}
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-900 text-center">
                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Frame</span>
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {currentJob.frame ?? '-'}
                        </span>
                      </div>

                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase tracking-wider">FPS</span>
                        <span className="text-xs font-mono font-bold text-indigo-400">
                          {currentJob.fps ?? '-'}
                        </span>
                      </div>

                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Time</span>
                        <span className="text-xs font-mono font-bold text-purple-400">
                          {currentJob.time ? currentJob.time.split('.')[0] : '-'}
                        </span>
                      </div>

                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Speed</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {currentJob.speed ?? '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Real-time FFmpeg Terminal Logs */}
                {currentJob?.logs && currentJob.logs.length > 0 && (
                  <div className="border border-slate-800 bg-slate-950 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowLogsTerminal(!showLogsTerminal)}
                      className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-850 flex items-center justify-between text-xs text-slate-400 font-mono transition"
                    >
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        FFmpeg Log Console ({currentJob.logs.length})
                      </span>
                      {showLogsTerminal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showLogsTerminal && (
                      <div
                        ref={logsContainerRef}
                        className="p-3 font-mono text-[11px] text-slate-300 space-y-1 max-h-40 overflow-y-auto bg-slate-950 select-text"
                      >
                        {currentJob.logs.map((log, i) => (
                          <div key={i} className="leading-tight text-slate-400">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Error Box */}
                {renderError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-rose-400 mb-0.5">Błąd Renderowania FFmpeg</p>
                      <p className="text-xs text-rose-300/80 font-mono">{renderError}</p>
                    </div>
                  </div>
                )}

                {/* Rendered Video Result Player */}
                {renderedVideoUrl ? (
                  <div className="space-y-4 pt-2">
                    <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-[9/16] max-h-[380px] mx-auto flex items-center justify-center shadow-2xl">
                      <video
                        src={renderedVideoUrl}
                        controls
                        autoPlay
                        loop
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <p className="text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Wideo wygenerowane pomyślnie
                        </p>
                        {currentJob?.fileSize && (
                          <p className="text-slate-400 text-[11px] mt-0.5">
                            Rozmiar pliku: {(currentJob.fileSize / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        )}
                      </div>

                      <a
                        href={renderedVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Pobierz MP4
                      </a>
                    </div>
                  </div>
                ) : (
                  !isRendering && !currentJob && (
                    <div className="border-2 border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 space-y-3">
                      <Film className="w-10 h-10 mx-auto text-slate-600" />
                      <p className="text-xs">
                        Kliknij <strong className="text-slate-300">"Uruchom Render"</strong> aby przetestować
                        wskaźnik progress bar w czasie rzeczywistym
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MAKE.COM CONFIGURATION & BLUEPRINT */}
        {activeTab === 'make' && (
          <div className="space-y-8">
            <div className="p-6 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-500/30 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-400" />
                  Instrukcja Integracji z Make.com (Integromat)
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Użyj modułu <strong className="text-purple-300">HTTP → Make a request</strong> w scenariuszu Make.com z asynchronicznym status URL
                </p>
              </div>

              <button
                onClick={downloadMakeBlueprint}
                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-lg shadow-purple-600/30 shrink-0"
              >
                <Download className="w-4 h-4" />
                Pobierz Szablon (.json) dla Make
              </button>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">Wartości dla modułu HTTP Make.com:</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 block text-[11px] mb-1 font-sans">URL Endpointu:</span>
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-400 font-bold">{appUrl}/api/combine-scenes</span>
                    <button
                      onClick={() => handleCopy(`${appUrl}/api/combine-scenes`, 'url')}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      {copiedKey === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 block text-[11px] mb-1 font-sans">Metoda:</span>
                  <span className="text-emerald-400 font-bold">POST</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 block text-[11px] mb-1 font-sans">Headers:</span>
                  <span className="text-slate-300">Content-Type: application/json</span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <span className="text-slate-500 block text-[11px] mb-1 font-sans">Stream Endpoint (SSE):</span>
                  <span className="text-purple-400 font-bold">{appUrl}/api/jobs/:jobId/stream</span>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    Struktura Body / Payload JSON
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Wybierz tryb generowania danych dla modułu HTTP Make.com
                  </p>
                </div>

                {/* Payload Mode Selector */}
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
                  <button
                    onClick={() => setMakePayloadMode('creator')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      makePayloadMode === 'creator'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Statyczny (z Kreatora)
                  </button>

                  <button
                    onClick={() => setMakePayloadMode('make_variables')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      makePayloadMode === 'make_variables'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Zmienne Make {'{{1.var}}'}
                  </button>

                  <button
                    onClick={() => setMakePayloadMode('make_array')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      makePayloadMode === 'make_array'
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mapowanie Tablicy {'{{1.scenes}}'}
                  </button>
                </div>
              </div>

              {/* Explanatory Banner */}
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/20 rounded-xl text-xs text-indigo-200/90 leading-relaxed flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Dlaczego w blueprint są wartości statyczne?</strong>
                  <p className="mt-0.5 text-indigo-200/80">
                    W domyślnym pliku blueprint HTTP wklejane są gotowe przykładowe adresy URL i napisy ze zbioru testowego, abyś mógł po zaimportowaniu do Make.com od razu kliknąć <code className="bg-indigo-900/60 px-1 py-0.5 rounded text-indigo-300">Run once</code> bez błędu braku danych. Jeśli chcesz podłączyć pliki wideo lub napisy z poprzednich kroków Make (np. Google Sheets, OpenAI, Airtable), przełącz powyrzej na <strong>"Zmienne Make {'{{1.var}}'}"</strong> i skopiuj nowy JSON.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400 font-mono">
                  {makePayloadMode === 'creator' && 'Tryb: Statyczny JSON testowy z podglądu'}
                  {makePayloadMode === 'make_variables' && 'Tryb: Zmienne dynamiczne Make.com {{1.scene_X_videoUrl}}'}
                  {makePayloadMode === 'make_array' && 'Tryb: Mapowanie całej tablicy scen z Make {{1.scenes}}'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(getMakePayloadJSON(), 'payload')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    {copiedKey === 'payload' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Skopiowano!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Kopiuj JSON
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleCopy(getCurlCommand(), 'curl')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    {copiedKey === 'curl' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Skopiowano cURL!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Kopiuj cURL
                      </>
                    )}
                  </button>
                </div>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 overflow-x-auto max-h-[360px]">
                {getMakePayloadJSON()}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: N8N WORKFLOW NODE */}
        {activeTab === 'n8n' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-orange-400" />
                    Kod Węzła HTTP Request dla n8n
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Skopiuj poniższy kod i wklej bezpośrednio na płótno n8n (CTRL+V / CMD+V)
                  </p>
                </div>

                <button
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(
                        {
                          nodes: [
                            {
                              parameters: {
                                method: 'POST',
                                url: `${appUrl}/api/combine-scenes`,
                                sendBody: true,
                                bodyParameters: {
                                  parameters: []
                                },
                                specifyBody: 'json',
                                jsonBody: getMakePayloadJSON()
                              },
                              name: 'Combine Video Scenes',
                              type: 'n8n-nodes-base.httpRequest',
                              typeVersion: 4.1,
                              position: [250, 300]
                            }
                          ]
                        },
                        null,
                        2
                      ),
                      'n8n'
                    )
                  }
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition"
                >
                  {copiedKey === 'n8n' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Kopiuj Node n8n
                </button>
              </div>

              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-orange-300 overflow-x-auto max-h-[380px]">
                {JSON.stringify(
                  {
                    parameters: {
                      method: 'POST',
                      url: `${appUrl}/api/combine-scenes`,
                      jsonBody: getMakePayloadJSON()
                    }
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}

        {/* TAB: CENTRUM WEBHOOKÓW (MAKE.COM / API) */}
        {activeTab === 'webhook' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Webhook className="w-6 h-6 text-indigo-400" />
                  Centrum Webhooków Make.com / API
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Skopiuj jeden z poniższych adresów Webhook URL i wklej go bezpośrednio do modułu <strong>HTTP / Webhook</strong> w Make.com, n8n lub Zapier. Każde żądanie natychmiast uruchomi renderowanie wideo z podglądem postępu na żywo!
                </p>
              </div>

              {/* Webhook Endpoint Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Endpoint 1 */}
                <div className="p-5 bg-slate-950 border border-indigo-500/30 rounded-2xl space-y-3 relative group hover:border-indigo-500/60 transition">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 rounded-md font-mono">
                      POST
                    </span>
                    <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aktywny Endpoint
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Uniwersalny Webhook Make.com</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Automatycznie generuje film ze scen lub na podstawie tematu.</p>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300">
                    <span className="truncate flex-1">{appUrl}/api/webhook</span>
                    <button
                      onClick={() => handleCopy(`${appUrl}/api/webhook`, 'wh-univ')}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                      title="Kopiuj URL"
                    >
                      {copiedKey === 'wh-univ' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Endpoint 2 */}
                <div className="p-5 bg-slate-950 border border-purple-500/30 rounded-2xl space-y-3 relative group hover:border-purple-500/60 transition">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-purple-300 bg-purple-500/20 border border-purple-500/30 rounded-md font-mono">
                      POST
                    </span>
                    <span className="text-[11px] font-medium text-purple-400">Dedykowany dla Auto-Pilota</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Webhook Auto-Pilot Short Generator</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Dedykowany adres do masowego tworzenia kreacji wideo z Make.com.</p>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-purple-300">
                    <span className="truncate flex-1">{appUrl}/api/webhook/make</span>
                    <button
                      onClick={() => handleCopy(`${appUrl}/api/webhook/make`, 'wh-make')}
                      className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition"
                      title="Kopiuj URL"
                    >
                      {copiedKey === 'wh-make' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Exact JSON Payload Structure Guide */}
              <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Rozwiązanie błędu "Couldn't parse the JSON body" z Make.com
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                    Rekomendowane Rozwiązanie
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Błąd pojawia się, ponieważ Make.com waliduje zawartość pola <strong>Request Content / Body</strong> zanim wyśle żądanie i nie pozwala na mieszanie surowego ciągu tekstowego <code className="text-amber-300 font-mono">211.json</code> z dodatkowymi klamrami JSON.
                </p>

                {/* Ready-to-copy URL box */}
                <div className="p-4 bg-slate-900 border border-indigo-500/40 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-indigo-300 block">
                    ✅ Wklej ten gotowy URL bezpośrednio do pola "URL" w Make.com:
                  </span>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300">
                    <span className="truncate flex-1">
                      {appUrl}/api/combine-scenes?async=true&amp;webhookUrl=https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw
                    </span>
                    <button
                      onClick={() => handleCopy(`${appUrl}/api/combine-scenes?async=true&webhookUrl=https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw`, 'custom-make-url')}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                      title="Kopiuj gotowy URL"
                    >
                      {copiedKey === 'custom-make-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1 mt-1">
                    <p>• <strong>W polu Body Content w Make.com:</strong> Zostaw czysty, niezmodyfikowany ciąg <code className="text-amber-300 font-mono font-bold">{`{{211.json}}`}</code> (lub <code className="text-amber-300 font-mono font-bold">{`{{21.JsonString}}`}</code>) tak jak miałeś na początku!</p>
                    <p>• <strong>Co to robi?</strong> Serwer od razu przyjmuje zadanie, wyciąga adres callback z adresu URL i po wypaleniu napisów oraz połączeniu scen automatycznie wyśle powiadomienie na Webhook Make: <code className="text-indigo-300 font-mono">https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw</code>.</p>
                  </div>
                </div>
              </div>

              {/* Interactive Webhook Tester */}
              <div className="p-5 bg-indigo-950/20 border border-indigo-800/40 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                      <Send className="w-4 h-4 text-indigo-400" />
                      Wyślij Próbny Webhook z Przeglądarki
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Kliknij przycisk poniżej, aby wysłać testowe żądanie POST na adres <code className="text-indigo-300">/api/webhook</code> i natychmiast zobaczyć wpis w logach oraz proces renderowania.
                    </p>
                  </div>
                  <button
                    disabled={webhookTesting}
                    onClick={async () => {
                      setWebhookTesting(true);
                      try {
                        const samplePayload = {
                          topic: '5 Niesamowitych Ciekawostek o Sztucznej Inteligencji',
                          webhookUrl: 'https://hook.eu1.make.com/fck3exut5hpc4xdbuqr1sgha7fglyuhw',
                          scenes: [
                            {
                              text: 'TESTOWY WEBHOOK MAKE.COM',
                              video_url: 'https://vjs.zencdn.net/v/oceans.mp4',
                              duration: 3
                            }
                          ]
                        };

                        const res = await fetch('/api/webhook', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(samplePayload)
                        });

                        if (res.ok) {
                          const data = await res.json();
                          addToast('success', 'Webhook wysłany!', `Utworzono zadanie renderowania ID: ${data.jobId}`);
                          fetchWebhookLogs();
                          fetchRecentJobs();
                        } else {
                          addToast('error', 'Błąd wysyłania Webhooka', 'Serwer zwrócił błąd żądania.');
                        }
                      } catch (err) {
                        addToast('error', 'Błąd sieciowy', (err as Error).message);
                      } finally {
                        setWebhookTesting(false);
                      }
                    }}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-950"
                  >
                    {webhookTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij Testowy Webhook
                  </button>
                </div>
              </div>

              {/* Webhook Logs History Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Odebrane Webhooki na Żywo ({webhookLogs.length})
                  </h4>
                  {webhookLogs.length > 0 && (
                    <button
                      onClick={clearWebhookLogs}
                      className="px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-950/40 rounded-lg transition border border-rose-900/50"
                    >
                      Wyczyść historię
                    </button>
                  )}
                </div>

                {webhookLogs.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 border border-slate-800/80 rounded-2xl">
                    <Webhook className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Brak odebranych webhooków w tej sesji.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Wyślij żądanie POST z Make.com na adres webhooka powyżej, aby zobaczyć pierwsze wpisy.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {webhookLogs.map((log) => (
                      <div key={log.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                              {log.endpoint}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {log.status.toUpperCase()}
                            </span>
                            {log.jobId && (
                              <span className="text-xs font-mono text-slate-400">
                                Job: <span className="text-white font-bold">{log.jobId}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Body Preview */}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-200 transition font-medium py-1">
                            Podejrzyj przesłany JSON Payload
                          </summary>
                          <pre className="mt-2 p-3 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto max-h-48">
                            {JSON.stringify(log.body, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE FEED & MONITOR ZADAŃ API / MAKE.COM */}
        {activeTab === 'jobs' && (
          <RenderingQueue
            jobs={recentJobs}
            onRefresh={fetchRecentJobs}
            onToast={addToast}
          />
        )}

        {/* TAB 5: API DOCUMENTATION & REAL-TIME SPECIFICATION */}
        {activeTab === 'docs' && (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Code2 className="w-6 h-6 text-indigo-400" />
                Specyfikacja REST & Real-Time Stream API
              </h3>

              <div className="space-y-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <h4 className="text-sm font-bold text-emerald-400 font-mono">POST /api/combine-scenes</h4>
                  <p className="text-xs text-slate-300">
                    Tworzy i rozpoczyna zadanie renderowania scen wideo z czcionką Montserrat-Bold.ttf oraz opcjonalnym audio w tle.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <h4 className="text-sm font-bold text-indigo-400 font-mono">GET /api/jobs/:jobId/stream (SSE Stream)</h4>
                  <p className="text-xs text-slate-300">
                    Strumień zdarzeń Server-Sent Events dostarczający aktualizacje postępu (`progress`, `frame`, `fps`, `time`, `speed`, `logs`) w czasie rzeczywistym.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <h4 className="text-sm font-bold text-purple-400 font-mono">GET /api/jobs/:jobId (HTTP Polling)</h4>
                  <p className="text-xs text-slate-300">
                    Pobiera pojedynczy obiekt reprezentujący stan i postęp zadania renderowania.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Global Toast Feedback Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
