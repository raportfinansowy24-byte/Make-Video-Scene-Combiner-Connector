import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Film,
  Download,
  Terminal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Search,
  Filter,
  Eye,
  X,
  Play,
  Gauge,
  Sparkles,
  Server,
  Layers,
  ArrowUpRight,
  Zap
} from 'lucide-react';
import { JobStatusResponse } from '../types';

interface RenderingQueueProps {
  jobs: JobStatusResponse[];
  onRefresh: () => void;
  onToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void;
  autoRefreshInterval?: number;
}

export const RenderingQueue: React.FC<RenderingQueueProps> = ({
  jobs,
  onRefresh,
  onToast,
  autoRefreshInterval = 2000
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [previewVideoUrl, setPreviewVideoUrl] = useState<{ url: string; title: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveStreamJobId, setLiveStreamJobId] = useState<string | null>(null);
  const [streamData, setStreamData] = useState<Record<string, JobStatusResponse>>({});

  const sseRef = useRef<EventSource | null>(null);

  // Auto Refresh Polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      onRefresh();
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, autoRefreshInterval, onRefresh]);

  // Subscribe to SSE for the active processing job if any
  const activeProcessingJob = useMemo(() => {
    return jobs.find((j) => j.status === 'processing' || j.status === 'queued');
  }, [jobs]);

  useEffect(() => {
    if (!activeProcessingJob) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setLiveStreamJobId(null);
      return;
    }

    if (liveStreamJobId !== activeProcessingJob.id) {
      if (sseRef.current) {
        sseRef.current.close();
      }

      setLiveStreamJobId(activeProcessingJob.id);
      try {
        const es = new EventSource(`/api/jobs/${activeProcessingJob.id}/stream`);
        sseRef.current = es;

        es.onmessage = (event) => {
          try {
            const data: JobStatusResponse = JSON.parse(event.data);
            setStreamData((prev) => ({ ...prev, [data.id]: data }));
            if (data.status === 'completed' || data.status === 'failed') {
              onRefresh();
            }
          } catch {}
        };

        es.onerror = () => {
          if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
          }
        };
      } catch {}
    }

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [activeProcessingJob, liveStreamJobId, onRefresh]);

  // Combine props jobs with streaming updates
  const combinedJobs = useMemo(() => {
    return jobs.map((job) => streamData[job.id] || job);
  }, [jobs, streamData]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return combinedJobs.filter((job) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'active'
          ? job.status === 'processing' || job.status === 'queued'
          : filter === 'completed'
          ? job.status === 'completed'
          : job.status === 'failed';

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        job.id.toLowerCase().includes(query) ||
        (job.step && job.step.toLowerCase().includes(query)) ||
        (job.outputFilename && job.outputFilename.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [combinedJobs, filter, searchQuery]);

  // Queue Statistics
  const stats = useMemo(() => {
    const total = combinedJobs.length;
    const active = combinedJobs.filter((j) => j.status === 'processing' || j.status === 'queued').length;
    const completed = combinedJobs.filter((j) => j.status === 'completed').length;
    const failed = combinedJobs.filter((j) => j.status === 'failed').length;

    return { total, active, completed, failed };
  }, [combinedJobs]);

  const toggleLogs = (jobId: string) => {
    setExpandedLogs((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (onToast) {
      onToast('info', 'Skopiowano do schowka', text);
    }
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadVideo = async (filename: string) => {
    try {
      if (onToast) onToast('info', 'Pobieranie wideo', `Pobieranie pliku ${filename}...`);
      const downloadUrl = `/api/exports/${filename}/download`;
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(`Błąd serwera podczas pobierania (${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      if (onToast) onToast('success', 'Pobrano pomyślnie!', `Plik ${filename} został zapisany.`);
    } catch (err) {
      if (onToast) onToast('error', 'Błąd pobierania', (err as Error).message);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (onToast) onToast('success', 'Usunięto z pamięci', `Zadanie ${jobId} zostało usunięte z historii.`);
        onRefresh();
      } else {
        const err = await res.json();
        if (onToast) onToast('error', 'Błąd', err.error || 'Nie udało się usunąć zadania');
      }
    } catch (err) {
      if (onToast) onToast('error', 'Błąd połączenia', (err as Error).message);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Czy na pewno chcesz wyczyszczać ukończoną historię renderowania?')) return;
    try {
      const res = await fetch('/api/jobs', { method: 'DELETE' });
      if (res.ok) {
        if (onToast) onToast('success', 'Wyczyszczono historię', 'Ukończona historia renderowania została wyczyszczona.');
        onRefresh();
      }
    } catch (err) {
      if (onToast) onToast('error', 'Błąd połączenia', (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Queue Metrics Overview */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-emerald-400" />
              Kolejka Renderowania Wideo w Czasie Rzeczywistym
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Podgląd na żywo paska postępu, logów FFmpeg, parametrów klatek i plików wyjściowych MP4
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                autoRefresh
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              Auto-odświeżanie {autoRefresh ? 'WŁ' : 'WYŁ'}
            </button>

            <button
              onClick={onRefresh}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-slate-700 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              Odśwież
            </button>

            {jobs.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-rose-800/50 active:scale-95"
                title="Wyczyszczenie historii z pamięci aplikacji"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Wyczyszczenie
              </button>
            )}
          </div>
        </div>

        {/* Live Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Wszystkie Zadania</span>
              <Layers className="w-4 h-4 text-slate-500" />
            </div>
            <span className="text-2xl font-bold text-white font-mono">{stats.total}</span>
          </div>

          <div className="p-4 bg-slate-950/80 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center justify-between text-emerald-400 text-xs mb-1">
              <span>W Trakcie / W Kolejce</span>
              <Gauge className="w-4 h-4 text-emerald-400 animate-spin" />
            </div>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{stats.active}</span>
          </div>

          <div className="p-4 bg-slate-950/80 border border-blue-500/30 rounded-xl">
            <div className="flex items-center justify-between text-blue-400 text-xs mb-1">
              <span>Wyrenderowane</span>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </div>
            <span className="text-2xl font-bold text-blue-400 font-mono">{stats.completed}</span>
          </div>

          <div className="p-4 bg-slate-950/80 border border-rose-500/30 rounded-xl">
            <div className="flex items-center justify-between text-rose-400 text-xs mb-1">
              <span>Błędy</span>
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <span className="text-2xl font-bold text-rose-400 font-mono">{stats.failed}</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wszystkie ({stats.total})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aktywne ({stats.active})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filter === 'completed' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Zakończone ({stats.completed})
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                filter === 'failed' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Błędy ({stats.failed})
            </button>
          </div>

          {/* Search Field */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Szukaj po ID zadania lub kroku..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render Queue Tasks List */}
      {filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <Film className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-semibold text-slate-300">Brak zadań spełniających kryteria</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || filter !== 'all'
              ? 'Spróbuj zmienić filtr lub wyczyścić pole wyszukiwania.'
              : 'Rozpocznij nowe renderowanie w kreatorze lub wyślij webhook z Make.com, a pojawi się tutaj w czasie rzeczywistym.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredJobs.map((job) => {
              const isProcessing = job.status === 'processing' || job.status === 'queued';
              const isCompleted = job.status === 'completed';
              const isFailed = job.status === 'failed';
              const isLogsOpen = Boolean(expandedLogs[job.id]);

              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-5 rounded-2xl border transition ${
                    isProcessing
                      ? 'bg-slate-900/95 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                      : isCompleted
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-rose-950/20 border-rose-800/40'
                  }`}
                >
                  {/* Job Header Info Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-white px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-1.5">
                        <Server className="w-3 h-3 text-slate-500" />
                        {job.id}
                      </span>

                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                          isProcessing
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isCompleted
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isProcessing && <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />}
                        {isCompleted && <CheckCircle2 className="w-3 h-3 text-blue-400" />}
                        {isFailed && <AlertCircle className="w-3 h-3 text-rose-400" />}
                        {isProcessing
                          ? job.status === 'queued'
                            ? 'W kolejce'
                            : 'Przetwarzanie FFmpeg'
                          : isCompleted
                          ? 'Zakończono Sukcesem'
                          : 'Błąd Renderowania'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <button
                        onClick={() => handleCopy(job.id, `job-${job.id}`)}
                        className="hover:text-white transition flex items-center gap-1"
                        title="Kopiuj ID zadania"
                      >
                        {copiedId === `job-${job.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition"
                        title="Usuń to zadanie z historii"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Progress Bar */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        {isProcessing && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                        {job.step || 'Przetwarzanie klatek wideo...'}
                      </span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">{job.progress}%</span>
                    </div>

                    <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                      <motion.div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-blue-500'
                            : isFailed
                            ? 'bg-rose-500'
                            : 'bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500 shadow-md shadow-emerald-500/50'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(job.progress, 3)}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                  </div>

                  {/* Live Render Metrics Grid (Frames, FPS, Time, Speed) */}
                  {isProcessing && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
                      <div className="p-1.5 bg-slate-900/60 rounded-lg">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Klatka</span>
                        <span className="text-xs font-mono font-bold text-slate-200">{job.frame ?? '-'}</span>
                      </div>
                      <div className="p-1.5 bg-slate-900/60 rounded-lg">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">FPS</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">{job.fps ?? '-'}</span>
                      </div>
                      <div className="p-1.5 bg-slate-900/60 rounded-lg">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Czas FFmpeg</span>
                        <span className="text-xs font-mono font-bold text-purple-400">{job.time ? job.time.split('.')[0] : '-'}</span>
                      </div>
                      <div className="p-1.5 bg-slate-900/60 rounded-lg">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Prędkość</span>
                        <span className="text-xs font-mono font-bold text-indigo-400">{job.speed ?? '-'}</span>
                      </div>
                    </div>
                  )}

                  {/* Completed Output Actions Bar */}
                  {isCompleted && job.outputUrl && (
                    <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Film className="w-4 h-4 text-emerald-400" />
                        <span>Wygenerowany plik:</span>
                        <code className="text-indigo-300 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {job.outputFilename || 'combined_video.mp4'}
                        </code>
                        {job.fileSize && (
                          <span className="text-slate-500 font-mono text-[11px]">
                            ({(job.fileSize / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setPreviewVideoUrl({
                              url: job.outputUrl!,
                              title: job.outputFilename || job.id
                            })
                          }
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition border border-slate-700"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-400" />
                          Otwórz Podgląd
                        </button>

                        <button
                          onClick={() => handleDownloadVideo(job.outputFilename || 'combined_video.mp4')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition shadow-md shadow-emerald-950 active:scale-95"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Pobierz MP4
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error Box */}
                  {isFailed && job.error && (
                    <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300 font-mono">
                      <span className="font-bold text-rose-400 block mb-0.5">Komunikat błędu:</span>
                      {job.error}
                    </div>
                  )}

                  {/* Expandable Logs Section */}
                  {job.logs && job.logs.length > 0 && (
                    <div className="mt-3 border-t border-slate-800/60 pt-2">
                      <button
                        onClick={() => toggleLogs(job.id)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 font-mono flex items-center gap-1 transition"
                      >
                        <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Logi konsoli FFmpeg ({job.logs.length})</span>
                        {isLogsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {isLogsOpen && (
                        <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 space-y-1 max-h-48 overflow-y-auto select-text">
                          {job.logs.map((logLine, idx) => (
                            <div key={idx} className="leading-relaxed text-slate-400">
                              {logLine}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Video Preview Modal */}
      <AnimatePresence>
        {previewVideoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewVideoUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-lg w-full space-y-4 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 truncate">
                  <Film className="w-4 h-4 text-emerald-400" />
                  {previewVideoUrl.title}
                </h4>
                <button
                  onClick={() => setPreviewVideoUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[460px] mx-auto flex items-center justify-center border border-slate-800">
                <video
                  src={previewVideoUrl.url}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => handleDownloadVideo(previewVideoUrl.title || 'combined_video.mp4')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-emerald-950 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Pobierz Wideo MP4
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
