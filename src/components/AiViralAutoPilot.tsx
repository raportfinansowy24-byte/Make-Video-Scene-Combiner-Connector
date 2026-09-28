import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Zap,
  Play,
  Pause,
  Film,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Download,
  ExternalLink,
  Code2,
  Layers,
  Flame,
  Globe,
  Music,
  Sliders,
  Radio,
  Eye,
  ArrowRight,
  Volume2,
  VolumeX,
  Mic,
  Type
} from 'lucide-react';
import { Scene, JobStatusResponse, CaptionStyle } from '../types';

interface AiViralAutoPilotProps {
  onLoadScriptToEditor: (scenes: Scene[], musicUrl?: string) => void;
  onJobStarted: (jobId: string) => void;
  onToast?: (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void;
}

const TOPIC_PRESETS = [
  {
    icon: '🧠',
    title: 'Psychologia Skupienia',
    topic: '5 psychologicznych sztuczek na natychmiastowe skupienie i produktywność',
    niche: 'Psychologia'
  },
  {
    icon: '🌌',
    title: 'Tajemnice Kosmosu',
    topic: 'Fakty o czarnych dziurach i kosmosie, które przerażają naukowców',
    niche: 'Kosmos'
  },
  {
    icon: '🏛️',
    title: 'Stoicka Mądrość',
    topic: '3 zasady Marka Aureliusza na zachowanie spokoju w chaosie',
    niche: 'Motywacja'
  },
  {
    icon: '🤖',
    title: 'Rewolucja AI',
    topic: 'Jak sztuczna inteligencja zmieni nasz świat w ciągu najbliższych 3 lat',
    niche: 'AI & Tech'
  },
  {
    icon: '💰',
    title: 'Zasady Bogactwa',
    topic: 'Nawyki finansowe 1% najbogatszych ludzi na świecie',
    niche: 'Finanse'
  },
  {
    icon: '❓',
    title: 'Ciekawostki Świata',
    topic: 'Niewiarygodne fakty o ludzkim ciele, o których nie miałeś pojęcia',
    niche: 'Ciekawostki'
  }
];

export const AiViralAutoPilot: React.FC<AiViralAutoPilotProps> = ({ onLoadScriptToEditor, onJobStarted, onToast }) => {
  const [activeMode, setActiveMode] = useState<'create' | 'translate'>('create');
  const [topic, setTopic] = useState('5 szokujących faktów o ludzkim mózgu');
  const [niche, setNiche] = useState('Psychologia');
  const [targetLanguage, setTargetLanguage] = useState('Polski');
  const [sceneCount, setSceneCount] = useState(4);
  const [resolution, setResolution] = useState('720x1280');

  // Translation mode text input
  const [translationScriptText, setTranslationScriptText] = useState(
    'This is a recording of a question that was sent in asking for a translation of this video: "Can artificial intelligence completely replace human video editors in the next five years, or will it remain just an assistant for creators?"'
  );

  // Generation status
  const [generatingScript, setGeneratingScript] = useState(false);
  const [autoPilotLoading, setAutoPilotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [generatedScript, setGeneratedScript] = useState<{
    title: string;
    description: string;
    hook: string;
    scenes: any[];
    backgroundMusicUrl: string;
  } | null>(null);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);

  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Lektor Text-to-Speech (TTS) State
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [syncDurationWithVoice, setSyncDurationWithVoice] = useState(true);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Animated Subtitles (Word-by-Word Hormozi / MrBeast style) State
  const [captionAnimation, setCaptionAnimation] = useState<'word-by-word' | 'single-word' | 'classic'>('word-by-word');
  const [highlightColor, setHighlightColor] = useState<'yellow' | 'lime' | 'cyan' | 'red' | 'white'>('yellow');
  const [captionPosition, setCaptionPosition] = useState<'bottom' | 'center' | 'top'>('bottom');

  // Interactive Live Animation Preview State
  const [previewWordIndex, setPreviewWordIndex] = useState(0);
  const previewWords = ['CZY', 'WIESZ,', 'ŻE', 'TEN', 'FORMAT', 'ZDOBYWA', 'MILIONY', 'WYŚWIETLEŃ?'];

  useEffect(() => {
    const timer = setInterval(() => {
      setPreviewWordIndex((prev) => (prev + 1) % previewWords.length);
    }, 420);
    return () => clearInterval(timer);
  }, [previewWords.length]);

  // Voice Preview Playback Handler
  const handleToggleVoicePreview = async () => {
    if (voicePreviewPlaying && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setVoicePreviewPlaying(false);
      return;
    }

    setVoicePreviewLoading(true);
    try {
      const sampleText = targetLanguage === 'Polski'
        ? 'Cześć! To jest podgląd głosu lektora dla Twoich filmów.'
        : 'Hello! This is a preview of the AI voiceover for your viral shorts.';

      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          language: targetLanguage
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd generowania próbki głosu');

      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }

      const audio = new Audio(data.audioUrl || data.streamUrl);
      audioPreviewRef.current = audio;
      audio.onplay = () => setVoicePreviewPlaying(true);
      audio.onended = () => setVoicePreviewPlaying(false);
      audio.onerror = () => {
        setVoicePreviewPlaying(false);
        onToast?.('error', 'Błąd odtwarzacza', 'Nie można odtworzyć próbki lektora.');
      };
      await audio.play();
    } catch (err) {
      onToast?.('error', 'Błąd próbki audio', (err as Error).message);
    } finally {
      setVoicePreviewLoading(false);
    }
  };

  // Auto-Pilot Full Execution
  const handleAutoPilotRun = async () => {
    if (activeMode === 'create' && !topic.trim()) return;
    if (activeMode === 'translate' && !translationScriptText.trim()) return;

    setAutoPilotLoading(true);
    setError(null);
    setJobStatus(null);
    setGeneratedScript(null);

    try {
      if (activeMode === 'translate') {
        const transRes = await fetch('/api/translate-video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptText: translationScriptText,
            targetLanguage,
            sceneCount
          })
        });

        const transData = await transRes.json();
        if (!transRes.ok) throw new Error(transData.error || 'Błąd tłumaczenia wideo');

        setGeneratedScript(transData);

        const combineRes = await fetch('/api/combine-scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenes: (transData.scenes || []).map((sc: any) => ({
              ...sc,
              captionStyle: {
                position: captionPosition,
                animation: captionAnimation,
                highlightColor,
                fontSize: 54,
                outlineWidth: 6,
                fontColor: 'white'
              }
            })),
            backgroundMusicUrl: transData.backgroundMusicUrl,
            audioVolume: ttsEnabled ? 0.2 : 0.3,
            outputResolution: resolution,
            fps: 30,
            async: true,
            tts: ttsEnabled,
            ttsLanguage: targetLanguage,
            syncDurationWithVoice,
            captionAnimation,
            highlightColor
          })
        });

        const combineData = await combineRes.json();
        if (!combineRes.ok) throw new Error(combineData.error || 'Błąd uruchomienia renderera MP4');

        setActiveJobId(combineData.jobId);
        onJobStarted(combineData.jobId);
        onToast?.('success', 'Auto-Pilot uruchomiony!', `Rozpoczęto renderowanie przetłumaczonego filmu z lektorem i napisami (ID: ${combineData.jobId})`);

        const eventSource = new EventSource(`/api/jobs/${combineData.jobId}/stream`);
        eventSource.onmessage = (evt) => {
          try {
            const parsedJob = JSON.parse(evt.data);
            setJobStatus(parsedJob);
            if (parsedJob.status === 'completed') {
              onToast?.('success', 'Wideo zmontowane!', 'Film Auto-Pilot został pomyślnie zrenderowany.');
              eventSource.close();
            } else if (parsedJob.status === 'failed') {
              onToast?.('error', 'Błąd renderowania Auto-Pilot', parsedJob.error || 'Wystąpił błąd renderowania.');
              eventSource.close();
            }
          } catch {}
        };
        eventSource.onerror = () => eventSource.close();
      } else {
        const res = await fetch('/api/auto-pilot-shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            niche,
            language: targetLanguage,
            outputResolution: resolution,
            async: true,
            tts: ttsEnabled,
            ttsLanguage: targetLanguage,
            syncDurationWithVoice,
            captionAnimation,
            highlightColor
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Nie udało się uruchomić Auto-Pilota');
        }

        setGeneratedScript(data.script);
        setActiveJobId(data.jobId);
        onJobStarted(data.jobId);
        onToast?.('success', 'Auto-Pilot uruchomiony!', `Stworzono scenariusz i rozpoczęto renderowanie z lektorem (ID: ${data.jobId})`);

        const eventSource = new EventSource(`/api/jobs/${data.jobId}/stream`);
        eventSource.onmessage = (evt) => {
          try {
            const parsedJob = JSON.parse(evt.data);
            setJobStatus(parsedJob);
            if (parsedJob.status === 'completed') {
              onToast?.('success', 'Wideo zmontowane!', 'Film Auto-Pilot został pomyślnie zrenderowany.');
              eventSource.close();
            } else if (parsedJob.status === 'failed') {
              onToast?.('error', 'Błąd renderowania Auto-Pilot', parsedJob.error || 'Wystąpił błąd renderowania.');
              eventSource.close();
            }
          } catch {}
        };

        eventSource.onerror = () => eventSource.close();
      }
    } catch (err) {
      const msg = (err as Error).message || 'Wystąpił nieoczekiwany błąd';
      setError(msg);
      onToast?.('error', 'Błąd żądania Auto-Pilot', msg);
    } finally {
      setAutoPilotLoading(false);
    }
  };

  // Generate Script Only
  const handleGenerateScriptOnly = async () => {
    if (activeMode === 'create' && !topic.trim()) return;
    if (activeMode === 'translate' && !translationScriptText.trim()) return;

    setGeneratingScript(true);
    setError(null);

    try {
      let data: any;
      if (activeMode === 'translate') {
        const res = await fetch('/api/translate-video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptText: translationScriptText,
            targetLanguage,
            sceneCount
          })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Nie udało się przetłumaczyć wideo');
      } else {
        const res = await fetch('/api/generate-viral-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            niche,
            language: targetLanguage,
            sceneCount
          })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Nie udało się wygenerować skryptu');
      }

      setGeneratedScript(data);

      const appScenes: Scene[] = data.scenes.map((s: any, i: number) => ({
        id: `gen-scene-${Date.now()}-${i}`,
        videoUrl: s.videoUrl,
        subtitles: s.subtitles,
        voiceover_text: s.voiceover_text || s.subtitles,
        trimStart: 0,
        trimEnd: s.duration || 4,
        captionStyle: {
          fontSize: 54,
          fontColor: 'white',
          outlineColor: 'black',
          outlineWidth: 6,
          boxColor: 'black@0.6',
          position: captionPosition,
          animation: captionAnimation,
          highlightColor: highlightColor
        }
      }));

      onLoadScriptToEditor(appScenes, data.backgroundMusicUrl);
      onToast?.('success', 'Scenariusz AI wygenerowany!', 'Nowo utworzone sceny z lektorem i animowanymi napisami zostały załadowane do edytora.');
    } catch (err) {
      const msg = (err as Error).message || 'Wystąpił błąd podczas generowania scenariusza';
      setError(msg);
      onToast?.('error', 'Błąd generowania scenariusza', msg);
    } finally {
      setGeneratingScript(false);
    }
  };

  const makePayloadJSON = JSON.stringify(
    {
      topic: '{{1.topic}}',
      niche: '{{1.niche}}',
      tts: ttsEnabled,
      ttsLanguage: targetLanguage === 'Polski' ? 'pl' : 'en',
      captionAnimation: captionAnimation,
      highlightColor: highlightColor,
      syncDurationWithVoice: syncDurationWithVoice,
      outputResolution: resolution,
      async: true,

    },
    null,
    2
  );

  return (
    <div className="space-y-8">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-6 sm:p-8 rounded-3xl border border-indigo-500/30 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            AI Generator Viral Shorts (Bezobsługowy Auto-Pilot)
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
            Zamień jeden temat w gotowy, viralowy film Short 9:16 z montażem i napisami
          </h2>

          <p className="text-slate-300 text-sm leading-relaxed">
            Sztuczna inteligencja Gemini pisze scenariusz, dobiera wideo w tle w wysokiej rozdzielczości, nakłada chwytliwe napisy czcionką <strong>Montserrat-Bold</strong>, miksuje ścieżkę muzyczną i wywołuje silnik FFmpeg bez żadnego wysiłku!
          </p>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Input Form */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          {/* Mode Switcher Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-400" />
              1. Tryb Tworzenia / Tłumaczenia Wideo
            </h3>

            <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
              <button
                onClick={() => setActiveMode('create')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  activeMode === 'create'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Generuj z Tematu
              </button>

              <button
                onClick={() => setActiveMode('translate')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  activeMode === 'translate'
                    ? 'bg-purple-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> Tłumaczenie Nagrania
              </button>
            </div>
          </div>

          {activeMode === 'create' ? (
            <>
              {/* Presets Grid */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Popularne Viralowe Nisze (Gotowe Wzorce):</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {TOPIC_PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setTopic(p.topic);
                        setNiche(p.niche);
                      }}
                      className={`p-3 text-left rounded-xl border text-xs transition flex flex-col gap-1.5 ${
                        topic === p.topic
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-medium shadow-md shadow-indigo-950'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base">{p.icon}</span>
                      <span className="font-semibold text-white line-clamp-1">{p.title}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1">{p.niche}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Wpisz własny temat na film Short:
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="np. 5 najgroźniejszych miejsc na ziemi, o których nie wiesz..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Video Translation Input Mode */
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-purple-300">
                Wklej nagranie, transkrypcję lub pytanie do przetłumaczenia na wideo Short:
              </label>
              <textarea
                value={translationScriptText}
                onChange={(e) => setTranslationScriptText(e.target.value)}
                rows={4}
                placeholder="Wklej tutaj dowolny tekst, pytania z nagrania lub scenariusz..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                Gemini AI przeanalizuje treść nagrania, przetłumaczy na wybrany język i podzieli na idealne sceny z dopasowanym wideo oraz napisami Montserrat.
              </p>
            </div>
          )}

          {/* Configuration Options Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Docelowy Język:</label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Polski">🇵🇱 Polski</option>
                <option value="English">🇬🇧 English</option>
                <option value="Español">🇪🇸 Español</option>
                <option value="Deutsch">🇩🇪 Deutsch</option>
                <option value="Français">🇫🇷 Français</option>
                <option value="Italiano">🇮🇹 Italiano</option>
                <option value="Українська">🇺🇦 Українська</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kategoria / Nisza:</label>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Psychologia">Psychologia</option>
                <option value="Kosmos">Kosmos</option>
                <option value="Motywacja">Motywacja & Stoicyzm</option>
                <option value="AI & Tech">AI & Nowe Technologie</option>
                <option value="Ciekawostki">Ciekawostki i Fakty</option>
                <option value="Finanse">Finanse & Sukces</option>
                <option value="Historia">Historia & Tajemnice</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Sceny (Długość):</label>
              <select
                value={sceneCount}
                onChange={(e) => setSceneCount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={3}>3 sceny (~12s)</option>
                <option value={4}>4 sceny (~16s)</option>
                <option value={5}>5 scen (~20s)</option>
                <option value={6}>6 scen (~24s)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Format Wideo:</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="720x1280">Pionowe 720p HD (9:16 - Szybki render)</option>
                <option value="1080x1920">Pionowe 1080p (9:16 Full HD)</option>
                <option value="1280x720">Poziome 720p (16:9 HD)</option>
                <option value="720x720">Kwadrat 720p (1:1)</option>
              </select>
            </div>
          </div>

          {/* Advanced Features: Lektor AI & Animated Subtitles Panel */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            {/* Lektor Text-to-Speech Block */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border transition ${ttsEnabled ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                    <Mic className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Lektor Text-to-Speech (Synteza Mowy AI)</span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold border border-indigo-400/30 uppercase">
                        {targetLanguage}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Automatyczne czytanie tekstu każdej sceny przez naturalnego lektora w wybranym języku.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleVoicePreview}
                    disabled={voicePreviewLoading || !ttsEnabled}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200 rounded-xl border border-slate-700 transition flex items-center gap-1.5"
                    title="Odsłuchaj próbkę głosu"
                  >
                    {voicePreviewLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : voicePreviewPlaying ? (
                      <Pause className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>{voicePreviewPlaying ? 'Zatrzymaj próbkę' : 'Odsłuchaj lektora'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTtsEnabled(!ttsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      ttsEnabled ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        ttsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {ttsEnabled && (
                <div className="pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncDurationWithVoice}
                      onChange={(e) => setSyncDurationWithVoice(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                    />
                    <span>Automatycznie wydłuż scenę wideo do tempa wypowiedzi lektora (Smart Audio Sync)</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">Ducking muzyki w tle: -70%</span>
                </div>
              )}
            </div>

            {/* Animowane Napisy Word-by-Word Block */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300">
                    <Type className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Animowane Napisy Word-by-Word</span>
                      <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-semibold border border-yellow-400/30">
                        Hormozi / TikTok Style
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Wypalane przez silnik libass z czcionką Montserrat-Bold i dynamicznym podświetlaniem wyraz po wyrazie.
                    </p>
                  </div>
                </div>
              </div>

              {/* Style & Color Selector Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {/* Style Mode */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Animacja Tekstu:</label>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setCaptionAnimation('word-by-word')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition text-center ${
                        captionAnimation === 'word-by-word' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Word-by-Word
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionAnimation('single-word')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition text-center ${
                        captionAnimation === 'single-word' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Pojedyncze
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionAnimation('classic')}
                      className={`py-1.5 px-2 rounded-lg font-medium transition text-center ${
                        captionAnimation === 'classic' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Klasyczne
                    </button>
                  </div>
                </div>

                {/* Highlight Color Palette */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Kolor Wyróżnienia:</label>
                  <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                    {[
                      { id: 'yellow', name: 'Złoty Neon', hex: '#FFD700', border: 'border-yellow-400' },
                      { id: 'lime', name: 'Zieleń Neon', hex: '#00FF66', border: 'border-emerald-400' },
                      { id: 'cyan', name: 'Cyan Błękit', hex: '#00E5FF', border: 'border-cyan-400' },
                      { id: 'red', name: 'Koral Czerwień', hex: '#FF3366', border: 'border-rose-400' },
                      { id: 'white', name: 'Czysta Biel', hex: '#FFFFFF', border: 'border-white' }
                    ].map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setHighlightColor(col.id as any)}
                        title={col.name}
                        className={`w-7 h-7 rounded-lg transition-transform flex items-center justify-center ${
                          highlightColor === col.id ? 'scale-110 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: col.hex }}
                      >
                        {highlightColor === col.id && (
                          <Check className="w-4 h-4 text-black stroke-[3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Pozycja na Ekranie:</label>
                  <select
                    value={captionPosition}
                    onChange={(e) => setCaptionPosition(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="bottom">Dolna (Optymalna dla Shorts 9:16)</option>
                    <option value="center">Środek (Maksymalna Uwaga Widza)</option>
                    <option value="top">Górna (Dla specyficznych kadrów)</option>
                  </select>
                </div>
              </div>

              {/* Live Interactive Word-by-Word Preview Widget */}
              <div className="mt-3 bg-gradient-to-br from-slate-900 via-black to-slate-950 border border-slate-800 rounded-xl p-4 overflow-hidden relative shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2">
                  <span className="flex items-center gap-1.5 text-yellow-400">
                    <Sparkles className="w-3.5 h-3.5" /> Podgląd efektu na żywo (Montserrat-Bold + libass):
                  </span>
                  <span className="uppercase text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                    Styl: {captionAnimation}
                  </span>
                </div>

                <div className="py-4 px-2 min-h-[64px] flex items-center justify-center text-center">
                  {captionAnimation === 'single-word' ? (
                    <motion.div
                      key={previewWordIndex}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.15, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className="font-extrabold text-2xl tracking-wider uppercase px-4 py-1.5 rounded-lg bg-black/80 border-2"
                      style={{
                        color: highlightColor === 'yellow' ? '#FFD700' : highlightColor === 'lime' ? '#00FF66' : highlightColor === 'cyan' ? '#00E5FF' : highlightColor === 'red' ? '#FF3366' : '#FFFFFF',
                        borderColor: highlightColor === 'yellow' ? '#FFD700' : highlightColor === 'lime' ? '#00FF66' : highlightColor === 'cyan' ? '#00E5FF' : highlightColor === 'red' ? '#FF3366' : '#FFFFFF',
                        textShadow: '0 2px 8px rgba(0,0,0,0.9)'
                      }}
                    >
                      {previewWords[previewWordIndex]}
                    </motion.div>
                  ) : captionAnimation === 'word-by-word' ? (
                    <div className="flex flex-wrap items-center justify-center gap-2 font-extrabold text-base tracking-wide uppercase">
                      {previewWords.map((w, idx) => {
                        const isCurrent = idx === previewWordIndex;
                        return (
                          <span
                            key={idx}
                            className={`transition-all duration-150 rounded px-1.5 py-0.5 ${
                              isCurrent
                                ? 'scale-110 shadow-lg font-black'
                                : 'text-slate-200 opacity-80'
                            }`}
                            style={{
                              color: isCurrent
                                ? highlightColor === 'yellow' ? '#FFD700' : highlightColor === 'lime' ? '#00FF66' : highlightColor === 'cyan' ? '#00E5FF' : highlightColor === 'red' ? '#FF3366' : '#FFFFFF'
                                : '#FFFFFF',
                              backgroundColor: isCurrent ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
                              textShadow: isCurrent ? '0 0 10px rgba(0,0,0,0.8)' : '0 1px 3px rgba(0,0,0,0.9)'
                            }}
                          >
                            {w}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="font-extrabold text-lg text-white bg-black/70 px-4 py-1.5 rounded-lg tracking-wide uppercase border border-slate-700">
                      CZY WIESZ, ŻE TEN FORMAT ZDOBYWA MILIONY WYŚWIETLEŃ?
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Errors */}
          {error && (
            <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <div>
                <strong>Błąd wywołania AI:</strong> {error}
              </div>
            </div>
          )}

          {/* Main Execution Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={handleAutoPilotRun}
              disabled={autoPilotLoading || generatingScript}
              className="w-full sm:flex-1 py-3.5 px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-950 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {autoPilotLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Uruchamianie Auto-Pilota Gemini AI...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300 animate-pulse" />
                  ⚡ Generuj Viral Shorta (Auto-Pilot)
                </>
              )}
            </button>

            <button
              onClick={handleGenerateScriptOnly}
              disabled={autoPilotLoading || generatingScript}
              className="w-full sm:w-auto py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs border border-slate-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generatingScript ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-400" />
              )}
              Generuj Scenariusz do Edytora
            </button>
          </div>
        </div>

        {/* API Endpoint & Integration Box for Make.com / n8n */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm border-b border-slate-800 pb-3">
              <Code2 className="w-4 h-4" />
              Bezobsługowy Endpoint Make.com
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Dla całkowitej automatyzacji w <strong>Make.com</strong> lub <strong>n8n</strong> wyślij zapytanie <code className="text-indigo-300 font-mono">POST /api/auto-pilot-shorts</code>. System sam wygeneruje napisy i zmontuje wideo!
            </p>

            <div className="relative">
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto leading-tight">
                {makePayloadJSON}
              </pre>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(makePayloadJSON);
                  setCopiedPayload(true);
                  setTimeout(() => setCopiedPayload(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition flex items-center gap-1"
              >
                {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3 bg-purple-950/30 border border-purple-500/20 rounded-xl text-xs text-purple-200 space-y-1">
            <div className="font-semibold text-purple-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-purple-400" />
              Status & SSE Webhook Stream
            </div>
            <p className="text-[11px] text-purple-300/80">
              Odbieraj powiadomienie o gotowym pliku MP4 na Twój webhook Make.com lub nasłuchuj SSE stream.
            </p>
          </div>
        </div>
      </div>

      {/* Generated Result & Real-Time Render Player */}
      {(generatedScript || jobStatus) && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Wygenerowany Viral Short
              </span>
              <h3 className="text-xl font-bold text-white">
                {generatedScript?.title || topic}
              </h3>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {generatedScript?.description}
              </p>
            </div>

            {jobStatus?.outputUrl && (
              <a
                href={jobStatus.outputUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950 transition flex items-center gap-2 shrink-0"
              >
                <Download className="w-4 h-4" /> Pobierz Gotowy MP4
              </a>
            )}
          </div>

          {/* Render Progress Monitor */}
          {jobStatus && (
            <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-2">
                  <RefreshCw
                    className={`w-4 h-4 text-indigo-400 ${
                      jobStatus.status === 'processing' ? 'animate-spin' : ''
                    }`}
                  />
                  Status FFmpeg Renderera: <strong className="text-white">{jobStatus.step}</strong>
                </span>
                <span className="font-mono text-indigo-400 font-bold text-sm">
                  {jobStatus.progress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-800">
                <motion.div
                  className={`h-full rounded-full transition-all duration-300 ${
                    jobStatus.status === 'completed'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : jobStatus.status === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400'
                  }`}
                  style={{ width: `${jobStatus.progress}%` }}
                />
              </div>

              {/* Status details */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                <span>FPS: {jobStatus.fps || 30}</span>
                <span>Klatka: {jobStatus.frame || 0}</span>
                <span>Czas renderu: {jobStatus.time || '00:00'}</span>
                <span>Prędkość: {jobStatus.speed || '1.0x'}</span>
              </div>
            </div>
          )}

          {/* Player & Scene Breakdown Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Video Player */}
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
              <span className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-indigo-400" /> Podgląd Wideo Short (9:16)
              </span>

              {jobStatus?.outputUrl ? (
                <div className="w-full max-w-[280px] aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 relative">
                  <video
                    src={jobStatus.outputUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full max-w-[280px] aspect-[9/16] bg-slate-900/80 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
                  <p className="text-xs font-medium text-slate-300">Generowanie pliku MP4 przez FFmpeg...</p>
                  <p className="text-[10px] text-slate-500 mt-1">Po nakryciu czcionką Montserrat i miksie audio ukaże się tutaj wideo.</p>
                </div>
              )}

              {jobStatus?.outputUrl && (
                <div className="mt-4 w-full flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={jobStatus.outputUrl}
                    className="w-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 rounded-lg px-2.5 py-1.5"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(jobStatus.outputUrl || '');
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg transition shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* Generated Scenes Table */}
            <div className="lg:col-span-7 space-y-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" /> Sekwencja Scen & Napisów Montserrat-Bold
              </h4>

              <div className="space-y-3">
                {generatedScript?.scenes.map((sc, i) => (
                  <div
                    key={i}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-4 hover:border-slate-700 transition"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">
                      #{i + 1}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="text-xs font-extrabold text-yellow-300 font-mono tracking-wide">
                        "{sc.subtitles}"
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-3">
                        <span>⏱️ {sc.duration || 4}s</span>
                        <span>🎬 Wideo: {sc.searchKeyword || 'Stock Clip'}</span>
                        <span className="text-indigo-400">Montserrat-Bold</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
