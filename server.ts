import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const execPromise = promisify(exec);

const PORT = 3000;
const app = express();

// Initialize GoogleGenAI SDK on server
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// Curated Stock Video Pool for AI Shorts
const STOCK_CLIPS_POOL = [
  { keywords: ['space', 'galaxy', 'stars', 'cosmos', 'universe', 'alien'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
  { keywords: ['city', 'drone', 'building', 'cyberpunk', 'neon', 'urban'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyflights.mp4' },
  { keywords: ['ocean', 'water', 'nature', 'beach', 'sunset', 'island'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  { keywords: ['mountain', 'forest', 'landscape', 'green', 'view'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
  { keywords: ['speed', 'car', 'race', 'fast', 'action', 'hyper'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4' },
  { keywords: ['tech', 'cyber', 'code', 'robot', 'future', 'ai', 'brain'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4' },
  { keywords: ['sky', 'birds', 'clouds', 'wind'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
  { keywords: ['warrior', 'stoic', 'history', 'fight', 'power'], url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4' }
];

function getStockVideoUrl(query: string, index: number): string {
  if (!query) return STOCK_CLIPS_POOL[index % STOCK_CLIPS_POOL.length].url;
  const lower = query.toLowerCase();
  const matched = STOCK_CLIPS_POOL.find((item) => item.keywords.some((k) => lower.includes(k)));
  return matched ? matched.url : STOCK_CLIPS_POOL[index % STOCK_CLIPS_POOL.length].url;
}

// Enable JSON body parsing with higher limit for payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const WORK_DIR = process.cwd();
const TEMP_DIR = path.join(WORK_DIR, 'temp');
const EXPORTS_DIR = path.join(WORK_DIR, 'exports');
const FONTS_DIR = path.join(WORK_DIR, 'fonts');
const MONTSERRAT_FONT_PATH = path.join(FONTS_DIR, 'Montserrat-Bold.ttf');

// Ensure necessary directories exist
[TEMP_DIR, EXPORTS_DIR, FONTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper to compute public URL respecting proxies
function getPublicBaseUrl(req: express.Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function getConfiguredMakeWebhookUrl(): string | undefined {
  return process.env.MAKE_WEBHOOK_URL?.trim() || undefined;
}

// Serve exported videos statically with CORS & range support
app.use('/exports', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}, express.static(EXPORTS_DIR, {
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}), (req, res) => {
  res.status(404).json({
    error: 'Plik wideo nie został znaleziony.',
    message: 'Plik mógł zostać usunięty podczas restartu serwera lub adres jest nieprawidłowy.'
  });
});

// Dedicated Video Streaming Endpoint with HTTP 206 Partial Content support
app.get('/api/exports/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(EXPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Nie znaleziono pliku wideo' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Serve fonts statically if needed
app.use('/fonts', express.static(FONTS_DIR));

// In-memory job store & real-time progress structure
interface Job {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  step: string;
  frame?: number;
  fps?: number;
  time?: string;
  speed?: string;
  logs?: string[];
  outputUrl?: string;
  outputFilename?: string;
  duration?: number;
  fileSize?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const JOBS_DB_PATH = path.join(EXPORTS_DIR, 'jobs_history.json');
const jobsStore = new Map<string, Job>();
const sseSubscribers = new Map<string, Set<express.Response>>();

function saveJobsToDisk() {
  try {
    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
    const jobsArray = Array.from(jobsStore.values());
    fs.writeFileSync(JOBS_DB_PATH, JSON.stringify(jobsArray, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Nie można zapisać historii zadań na dysk:', (err as Error).message);
  }
}

function loadJobsFromDisk() {
  try {
    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
    if (fs.existsSync(JOBS_DB_PATH)) {
      const data = fs.readFileSync(JOBS_DB_PATH, 'utf-8');
      const jobsArray: Job[] = JSON.parse(data);
      if (Array.isArray(jobsArray)) {
        jobsArray.forEach(job => {
          if (job && job.id) {
            jobsStore.set(job.id, job);
          }
        });
        console.log(`[Historia] Załadowano ${jobsStore.size} zadań renderowania z pamięci dyskowej (${JOBS_DB_PATH})`);
      }
    }

    // Auto-discover exported .mp4 files on disk that might be missing from jobs_history.json
    if (fs.existsSync(EXPORTS_DIR)) {
      const files = fs.readdirSync(EXPORTS_DIR);
      for (const file of files) {
        if (file.endsWith('.mp4')) {
          const filePath = path.join(EXPORTS_DIR, file);
          const stats = fs.statSync(filePath);
          let existingJob = Array.from(jobsStore.values()).find(j => j.outputFilename === file);
          if (!existingJob) {
            const match = file.match(/combined_video_(job_[^\.]+)\.mp4/);
            const jobId = match ? match[1] : `job_disk_${stats.mtimeMs}`;
            const discoveredJob: Job = {
              id: jobId,
              status: 'completed',
              progress: 100,
              step: 'Renderowanie zakończone pomyślnie!',
              logs: [`[${new Date(stats.mtimeMs).toLocaleTimeString()}] Automatyczne przywrócenie pliku wideo MP4 z pamięci dyskowej`],
              outputFilename: file,
              fileSize: stats.size,
              createdAt: new Date(stats.birthtimeMs || stats.mtimeMs).toISOString(),
              updatedAt: new Date(stats.mtimeMs).toISOString()
            };
            jobsStore.set(jobId, discoveredJob);
          }
        }
      }
    }
    saveJobsToDisk();
  } catch (err) {
    console.warn('Nie można załadować historii zadań z dysku:', (err as Error).message);
  }
}

// Broadcast job updates over SSE and update jobsStore
function updateJobProgress(
  jobId: string,
  update: Partial<Job>,
  logMsg?: string
) {
  const job = jobsStore.get(jobId);
  if (!job) return;

  if (update.status) job.status = update.status;
  if (typeof update.progress === 'number') job.progress = Math.min(100, Math.max(0, Math.round(update.progress)));
  if (update.step) job.step = update.step;
  if (typeof update.frame === 'number') job.frame = update.frame;
  if (typeof update.fps === 'number') job.fps = update.fps;
  if (update.time) job.time = update.time;
  if (update.speed) job.speed = update.speed;
  if (update.outputUrl) job.outputUrl = update.outputUrl;
  if (update.outputFilename) job.outputFilename = update.outputFilename;
  if (update.fileSize) job.fileSize = update.fileSize;
  if (update.error) job.error = update.error;
  job.updatedAt = new Date().toISOString();

  if (logMsg) {
    if (!job.logs) job.logs = [];
    job.logs.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
    if (job.logs.length > 40) job.logs.shift(); // keep recent logs
  }

  // Broadcast to connected SSE subscribers
  const subscribers = sseSubscribers.get(jobId);
  if (subscribers && subscribers.size > 0) {
    const dataString = `data: ${JSON.stringify(job)}\n\n`;
    subscribers.forEach((res) => {
      try {
        res.write(dataString);
      } catch (err) {
        console.warn('SSE write failed:', (err as Error).message);
      }
    });
  }

  saveJobsToDisk();
}

// Download Montserrat-Bold.ttf font if missing
async function ensureMontserratFont(): Promise<boolean> {
  if (fs.existsSync(MONTSERRAT_FONT_PATH)) {
    const stats = fs.statSync(MONTSERRAT_FONT_PATH);
    if (stats.size > 10000) {
      console.log('✓ Montserrat-Bold.ttf font is ready at:', MONTSERRAT_FONT_PATH);
      return true;
    }
  }

  console.log('⏳ Montserrat-Bold.ttf not found. Downloading font...');
  const fontUrls = [
    'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf',
    'https://cdn.jsdelivr.net/npm/@fontsource/montserrat/files/montserrat-latin-700-normal.ttf',
    'https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm453WzAfrCUrU9gRV91.ttf'
  ];

  for (const fontUrl of fontUrls) {
    try {
      await downloadFile(fontUrl, MONTSERRAT_FONT_PATH);
      const stats = fs.statSync(MONTSERRAT_FONT_PATH);
      if (stats.size > 10000) {
        console.log(`✓ Montserrat-Bold.ttf successfully downloaded (${stats.size} bytes)`);
        return true;
      }
    } catch (err) {
      console.warn(`Failed downloading font from ${fontUrl}:`, (err as Error).message);
    }
  }

  console.error('⚠️ Could not download Montserrat-Bold.ttf. FFmpeg will fallback to default system fonts if needed.');
  return false;
}

// Helper to generate a stylized vertical video background or audio when remote download fails
function generateLocalFallbackVideo(destPath: string, duration = 6): Promise<void> {
  return new Promise((resolve, reject) => {
    if (destPath.endsWith('.mp3') || destPath.endsWith('.wav') || destPath.endsWith('.m4a')) {
      const audioCmd = `ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:a libmp3lame -b:a 128k -t ${duration} "${destPath}"`;
      exec(audioCmd, (err) => {
        if (err) return reject(err);
        resolve();
      });
      return;
    }

    const palette = [
      { bg: '0x1e1b4b', grid: '0x312e81' },
      { bg: '0x0f172a', grid: '0x334155' },
      { bg: '0x172554', grid: '0x1d4ed8' },
      { bg: '0x064e3b', grid: '0x047857' },
      { bg: '0x3b0764', grid: '0x6b21a8' }
    ];
    const choice = palette[Math.floor(Math.random() * palette.length)];
    const ffmpegCmd = `ffmpeg -y -f lavfi -i "color=c=${choice.bg}:s=720x1280:d=${duration},drawgrid=w=60:h=60:t=1:c=${choice.grid}@0.2" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -pix_fmt yuv420p -c:a aac -t ${duration} "${destPath}"`;
    exec(ffmpegCmd, (err) => {
      if (err) {
        console.error('[Fallback Video Error]', err);
        return reject(err);
      }
      resolve();
    });
  });
}

// Utility to download a file from HTTP/HTTPS URL with download progress logging and fallback
function downloadFile(fileUrl: string, destPath: string, jobId?: string): Promise<void> {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) {
    console.warn(`[Download] Nieprawidłowy adres URL: ${fileUrl}. Generowanie lokalnego tła...`);
    if (jobId) updateJobProgress(jobId, {}, 'Generowanie lokalnego tła wideo w 720p...');
    return generateLocalFallbackVideo(destPath, 6);
  }

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = fileUrl.startsWith('https') ? https : http;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch {
      return generateLocalFallbackVideo(destPath, 6).then(resolve).catch(reject);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    const request = client.get(fileUrl, { headers }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        const redirectUrl = new URL(response.headers.location, fileUrl).toString();
        return downloadFile(redirectUrl, destPath, jobId).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200 && response.statusCode !== 206) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        console.warn(`[Download Warning] Remote server returned HTTP ${response.statusCode} for ${fileUrl}. Generating fallback video background...`);
        if (jobId) {
          updateJobProgress(jobId, {}, `Zewnętrzny serwer wideo zwrócił kod ${response.statusCode}. Wygenerowano eleganckie tło zastępcze.`);
        }
        return generateLocalFallbackVideo(destPath, 6).then(resolve).catch(reject);
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      console.warn(`[Download Error] ${err.message}. Generating fallback video background...`);
      if (jobId) {
        updateJobProgress(jobId, {}, 'Nie można pobrać wideo z zewnętrznego URL. Użyto tła zastępczego.');
      }
      return generateLocalFallbackVideo(destPath, 6).then(resolve).catch(reject);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      console.warn(`[Download Timeout] ${fileUrl}. Generating fallback video background...`);
      return generateLocalFallbackVideo(destPath, 6).then(resolve).catch(reject);
    });
  });
}

// Interfaces for Scene Request Body
interface CaptionStyle {
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  boxColor?: string;
  position?: 'bottom' | 'center' | 'top';
  alignment?: 'center' | 'left' | 'right';
  fontPath?: string;
  animation?: 'word-by-word' | 'single-word' | 'karaoke' | 'classic';
  highlightColor?: 'yellow' | 'green' | 'cyan' | 'red' | 'white';
}

interface SceneInput {
  videoUrl?: string;
  imageUrl?: string;
  duration?: number;
  scene_duration?: number;
  subtitles?: string;
  voiceover_text?: string;
  caption?: string;
  text?: string;
  captionStyle?: CaptionStyle;
  trimStart?: number;
  trimEnd?: number;
}

interface CombineScenesPayload {
  scenes: SceneInput[];
  audioUrl?: string;
  backgroundMusicUrl?: string;
  audioVolume?: number;
  voiceoverUrl?: string;
  outputResolution?: string;
  fps?: number;
  async?: boolean;
  webhookUrl?: string;
  tts?: boolean;
  ttsLanguage?: string;
  ttsSpeed?: number;
  syncDurationWithVoice?: boolean;
  captionAnimation?: 'word-by-word' | 'single-word' | 'karaoke' | 'classic';
  highlightColor?: 'yellow' | 'green' | 'cyan' | 'red' | 'white';
}

// Language normalizer for Google TTS
function normalizeLanguageCode(lang?: string): string {
  if (!lang) return 'pl';
  const l = lang.trim().toLowerCase();
  if (l.startsWith('pl') || l.includes('pol')) return 'pl';
  if (l.startsWith('en') || l.includes('ang') || l.includes('eng')) return 'en';
  if (l.startsWith('es') || l.includes('hiszp') || l.includes('span')) return 'es';
  if (l.startsWith('de') || l.includes('niem') || l.includes('ger')) return 'de';
  if (l.startsWith('fr') || l.includes('franc') || l.includes('fren')) return 'fr';
  if (l.startsWith('it') || l.includes('włos') || l.includes('ital')) return 'it';
  if (l.startsWith('uk') || l.startsWith('ua') || l.includes('ukr')) return 'uk';
  return l.slice(0, 2);
}

// Split long text into natural chunks for TTS synthesis
function splitIntoTtsChunks(text: string, maxLen: number = 160): string[] {
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen) {
      if (cur) chunks.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks.length > 0 ? chunks : [clean];
}

// Download single TTS audio chunk
function downloadTtsChunk(text: string, lang: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=tw-ob`;
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`Google TTS returned HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Measure audio duration using ffprobe
function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      (err, stdout) => {
        if (err) return resolve(0);
        const dur = parseFloat(stdout.trim());
        resolve(isNaN(dur) ? 0 : dur);
      }
    );
  });
}

// High quality TTS Generator supporting arbitrary sentence length
async function generateTtsAudio(
  text: string,
  lang: string,
  destPath: string,
  tempDir: string
): Promise<number> {
  const cleanLang = normalizeLanguageCode(lang);
  const chunks = splitIntoTtsChunks(text);
  if (chunks.length === 0) return 0;

  if (chunks.length === 1) {
    await downloadTtsChunk(chunks[0], cleanLang, destPath);
    return getAudioDuration(destPath);
  }

  // Multi-chunk download and stitch with ffmpeg concat
  const chunkFiles: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkFile = path.resolve(tempDir, `tts_chunk_${Date.now()}_${i}.mp3`);
    await downloadTtsChunk(chunks[i], cleanLang, chunkFile);
    chunkFiles.push(chunkFile);
  }

  const listFile = path.resolve(tempDir, `tts_concat_${Date.now()}.txt`);
  fs.writeFileSync(listFile, chunkFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

  await new Promise<void>((resolve, reject) => {
    exec(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${destPath}"`, (err, _stdout, stderr) => {
      // Clean up chunk files
      try {
        if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
        chunkFiles.forEach((f) => { if (fs.existsSync(f)) fs.unlinkSync(f); });
      } catch {}

      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });

  return getAudioDuration(destPath);
}

// Convert seconds to ASS time format (h:mm:ss.cc)
function formatAssTime(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = Math.floor(safeSec % 60);
  const centis = Math.floor((safeSec % 1) * 100);
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

// Word-by-Word Animated Subtitle Generator (Advanced SubStation Alpha .ass format)
// Produces signature Hormozi / MrBeast / TikTok viral karaoke captions
function generateWordByWordAss(
  text: string,
  duration: number,
  options: {
    animation?: 'word-by-word' | 'single-word' | 'karaoke' | 'classic';
    highlightColor?: 'yellow' | 'green' | 'cyan' | 'red' | 'white';
    position?: 'bottom' | 'center' | 'top';
    fontSize?: number;
    outlineWidth?: number;
  } = {}
): string {
  const words = text.trim().replace(/[\r\n]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const safeDuration = Math.max(duration, 1.0);
  const highlightColor =
    options.highlightColor === 'green' ? '&H0022C55E&' :
    options.highlightColor === 'cyan' ? '&H00FFFF00&' :
    options.highlightColor === 'red' ? '&H002222FF&' :
    options.highlightColor === 'white' ? '&H00FFFFFF&' :
    '&H0000E6FF&'; // Default signature electric gold/yellow

  const mode = options.animation || 'word-by-word';
  const position = options.position || 'bottom';
  const alignment = position === 'center' ? 5 : position === 'top' ? 8 : 2;
  const marginV = position === 'center' ? 0 : position === 'top' ? 160 : 220;
  const fontSize = options.fontSize || 54;
  const outlineWidth = options.outlineWidth || 6;

  let totalChars = 0;
  words.forEach((w) => { totalChars += Math.max(w.length, 2); });

  const wordTimings: { word: string; start: number; end: number }[] = [];
  let currentTime = 0;
  words.forEach((w, i) => {
    const wordDur = (Math.max(w.length, 2) / totalChars) * safeDuration;
    const start = currentTime;
    const end = i === words.length - 1 ? safeDuration : currentTime + wordDur;
    currentTime += wordDur;
    wordTimings.push({ word: w, start, end });
  });

  let dialogues = '';

  if (mode === 'single-word') {
    // Punchy 1-word pop-up (MrBeast style)
    wordTimings.forEach(({ word, start, end }) => {
      const s = formatAssTime(start);
      const e = formatAssTime(end);
      dialogues += `Dialogue: 0,${s},${e},HormoziStyle,,0,0,0,,{\\c${highlightColor}\\fscx124\\fscy124\\b1}${word.toUpperCase()}\\N\n`;
    });
  } else if (mode === 'classic') {
    // Static clean subtitle across duration
    const s = formatAssTime(0);
    const e = formatAssTime(safeDuration);
    dialogues += `Dialogue: 0,${s},${e},HormoziStyle,,0,0,0,,{\\c&H00FFFFFF&\\b1}${words.join(' ').toUpperCase()}\\N\n`;
  } else {
    // Default: 'word-by-word' active word enlargement and vibrant highlight (Hormozi style)
    const chunkSize = 4;
    for (let c = 0; c < words.length; c += chunkSize) {
      const chunkWords = words.slice(c, c + chunkSize);
      const chunkIndices = chunkWords.map((_, idx) => c + idx);

      chunkIndices.forEach((activeIdx) => {
        const timing = wordTimings[activeIdx];
        const s = formatAssTime(timing.start);
        const e = formatAssTime(timing.end);

        const lineFormatted = chunkWords
          .map((w, idx) => {
            const globalIdx = c + idx;
            if (globalIdx === activeIdx) {
              return `{\\c${highlightColor}\\fscx118\\fscy118\\b1}${w.toUpperCase()}{\\r\\c&H00FFFFFF&\\b1}`;
            }
            return `{\\c&H00FFFFFF&\\b1}${w.toUpperCase()}`;
          })
          .join(' ');

        dialogues += `Dialogue: 0,${s},${e},HormoziStyle,,0,0,0,,${lineFormatted}\\N\n`;
      });
    }
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HormoziStyle,Montserrat,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,${outlineWidth},2,${alignment},24,24,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues}`;
}

// Escape string for FFmpeg drawtext filter
function escapeDrawText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

// Spawn FFmpeg process with real-time progress parsing via -progress pipe:1
function runFfmpegWithProgress(
  args: string[],
  jobId: string,
  startProgress: number,
  endProgress: number,
  expectedDurationSec: number = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Inject progress pipe flag
    const fullArgs = ['-progress', 'pipe:1', ...args];
    console.log(`[FFmpeg Spawn] ffmpeg ${fullArgs.join(' ')}`);

    const child = spawn('ffmpeg', fullArgs);
    let buffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let frame: number | undefined;
      let fps: number | undefined;
      let timeUs: number | undefined;
      let timeStr: string | undefined;
      let speed: string | undefined;

      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parts[1].trim();

          if (key === 'frame') frame = parseInt(val, 10);
          if (key === 'fps') fps = parseFloat(val);
          if (key === 'out_time') timeStr = val;
          if (key === 'out_time_us') timeUs = Math.round(parseInt(val, 10) / 1000);
          if (key === 'speed') speed = val;
        }
      }

      let currentPercent = startProgress;
      if (expectedDurationSec > 0 && timeUs) {
        const elapsedSec = timeUs / 1000;
        const ratio = Math.min(1, Math.max(0, elapsedSec / expectedDurationSec));
        currentPercent = Math.round(startProgress + ratio * (endProgress - startProgress));
      }

      updateJobProgress(jobId, {
        progress: currentPercent,
        frame,
        fps,
        time: timeStr,
        speed
      });
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // Capture key lines for terminal logs UI
      const trimmed = text.trim();
      if (trimmed.includes('Stream #') || trimmed.includes('Output #') || trimmed.includes('video:') || trimmed.includes('error')) {
        const line = trimmed.split('\n')[0];
        if (line) {
          updateJobProgress(jobId, {}, line.substring(0, 120));
        }
      }
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        updateJobProgress(jobId, { progress: endProgress });
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
      }
    });
  });
}

// Async Video Scene Combiner Pipeline with granular step-by-step progress
async function processCombineScenesJob(jobId: string, payload: CombineScenesPayload, baseUrl: string) {
  const job = jobsStore.get(jobId);
  if (!job) return;

  const jobTempDir = path.join(TEMP_DIR, jobId);
  fs.mkdirSync(jobTempDir, { recursive: true });

  try {
    updateJobProgress(
      jobId,
      { status: 'processing', step: 'Sprawdzanie środowiska i czcionki Montserrat', progress: 5 },
      'Rozpoczęto zadanie renderowania scen wideo FFmpeg'
    );

    await ensureMontserratFont();

    // Resolution setup (defaults to 720p vertical 720x1280 for fast processing)
    let rawRes = payload.outputResolution || (payload as any).resolution || '720x1280';
    if (typeof rawRes === 'string') {
      const lower = rawRes.trim().toLowerCase();
      if (lower === '720p' || lower === '720') rawRes = '720x1280';
      else if (lower === '1080p' || lower === '1080') rawRes = '1080x1920';
      else if (lower === '480p' || lower === '480') rawRes = '480x854';
    }
    const resolutionStr = rawRes || '720x1280';
    const parts = resolutionStr.split('x').map((n: string) => parseInt(n, 10));
    const targetWidth = parts[0] || 720;
    const targetHeight = parts[1] || 1280;
    const targetFps = payload.fps || 30;

    const scenes = payload.scenes || [];
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error('Payload must contain at least one valid scene in "scenes" array.');
    }

    updateJobProgress(
      jobId,
      { step: `Pobieranie ${scenes.length} klipów wideo`, progress: 10 },
      `Rozpoczynanie pobierania ${scenes.length} plików wideo/obrazów...`
    );

    const processedScenePaths: string[] = [];
    let totalEstimatedDuration = 0;
    const ttsEnabled = payload.tts !== false;
    const ttsLanguage = normalizeLanguageCode(payload.ttsLanguage || (payload as any).language || 'pl');
    const defaultCaptionAnim = payload.captionAnimation || 'word-by-word';
    const defaultHighlightCol = payload.highlightColor || 'yellow';

    // Process each scene
    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const sceneNum = index + 1;
      const sceneStartProgress = Math.round(15 + (index / scenes.length) * 50);
      const sceneEndProgress = Math.round(15 + ((index + 1) / scenes.length) * 50);

      updateJobProgress(
        jobId,
        {
          step: `Przetwarzanie Sceny ${sceneNum}/${scenes.length} (Lektor TTS + animowane napisy)`,
          progress: sceneStartProgress
        },
        `Przygotowywanie lektora TTS i napisów word-by-word dla sceny ${sceneNum}...`
      );

      const rawAssetUrl = (scene as any).video_url || scene.videoUrl || (scene as any).url || scene.imageUrl;
      if (!rawAssetUrl) {
        throw new Error(`Scene ${sceneNum} is missing "video_url", "videoUrl" or "url".`);
      }

      const ext = rawAssetUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp4';
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext) || !!scene.imageUrl;
      const downloadedAssetPath = path.join(jobTempDir, `raw_scene_${sceneNum}.${isImage ? 'jpg' : 'mp4'}`);

      // Download asset
      console.log(`Downloading scene ${sceneNum}: ${rawAssetUrl}`);
      await downloadFile(rawAssetUrl, downloadedAssetPath, jobId);
      updateJobProgress(jobId, {}, `Zapisano plik źródłowy: raw_scene_${sceneNum}.${isImage ? 'jpg' : 'mp4'}`);

      // Extract speech text for TTS and captions
      const speechText = (
        scene.voiceover_text ||
        scene.subtitles ||
        scene.caption ||
        scene.text ||
        (scene as any).tekst_głosowy ||
        (scene as any).voiceover ||
        ''
      ).trim();

      // Initial Scene duration
      let sceneDuration = scene.duration || scene.scene_duration || 5;
      if (typeof scene.trimStart === 'number' && typeof scene.trimEnd === 'number' && scene.trimEnd > scene.trimStart) {
        sceneDuration = scene.trimEnd - scene.trimStart;
      }

      // 1. Text-to-Speech Generation
      let hasTtsAudio = false;
      const sceneTtsPath = path.join(jobTempDir, `scene_tts_${sceneNum}.mp3`);

      if (ttsEnabled && speechText.length > 0) {
        try {
          updateJobProgress(
            jobId,
            {},
            `Generowanie głosu lektora TTS (${ttsLanguage.toUpperCase()}): "${speechText.slice(0, 45)}..."`
          );
          const ttsDuration = await generateTtsAudio(speechText, ttsLanguage, sceneTtsPath, jobTempDir);
          if (ttsDuration > 0 && fs.existsSync(sceneTtsPath)) {
            hasTtsAudio = true;
            // Synchronize scene duration with voice narration length (+0.35s natural trailing pause)
            if (payload.syncDurationWithVoice !== false) {
              const syncedDuration = Math.round((ttsDuration + 0.35) * 10) / 10;
              sceneDuration = Math.max(syncedDuration, sceneDuration);
              console.log(`✓ Scene ${sceneNum} synchronized with TTS voice duration: ${sceneDuration}s (TTS: ${ttsDuration}s)`);
            }
          }
        } catch (ttsErr) {
          console.warn(`⚠️ TTS warning for scene ${sceneNum}:`, (ttsErr as Error).message);
          updateJobProgress(jobId, {}, `Lektor TTS dla sceny ${sceneNum} niedostępny, używanie domyślnego audio.`);
        }
      }

      totalEstimatedDuration += sceneDuration;

      // 2. Word-by-Word Animated Subtitles (ASS Format)
      const capStyle = scene.captionStyle || {};
      const animMode = capStyle.animation || defaultCaptionAnim;
      const highlightCol = capStyle.highlightColor || defaultHighlightCol;
      const position = capStyle.position || 'bottom';
      const fontSize = capStyle.fontSize || (targetWidth > 1000 ? 54 : 44);
      const outlineWidth = capStyle.outlineWidth ?? 6;

      let assSubtitleFilter = '';
      const sceneAssPath = path.join(jobTempDir, `scene_sub_${sceneNum}.ass`);

      if (speechText.length > 0) {
        try {
          const assContent = generateWordByWordAss(speechText, sceneDuration, {
            animation: animMode,
            highlightColor: highlightCol,
            position,
            fontSize,
            outlineWidth
          });
          fs.writeFileSync(sceneAssPath, assContent, 'utf8');
          // Escape single quotes and backslashes for FFmpeg filter
          const cleanAssPath = sceneAssPath.replace(/\\/g, '/').replace(/'/g, "'\\\\''");
          const cleanFontsDir = FONTS_DIR.replace(/\\/g, '/').replace(/'/g, "'\\\\''");
          assSubtitleFilter = `,ass='${cleanAssPath}':fontsdir='${cleanFontsDir}'`;
        } catch (assErr) {
          console.warn(`⚠️ ASS subtitle error for scene ${sceneNum}:`, assErr);
        }
      }

      // Render & Normalize Scene with FFmpeg
      const normalizedScenePath = path.join(jobTempDir, `norm_scene_${sceneNum}.mp4`);
      const scaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-ih)/2:(oh-ih)/2:black,setsar=1,fps=${targetFps}`;
      const videoFilterWithAss = `${scaleFilter}${assSubtitleFilter}`;

      let ffmpegArgs: string[] = [];

      if (isImage) {
        if (hasTtsAudio) {
          ffmpegArgs = [
            '-y',
            '-loop', '1',
            '-i', downloadedAssetPath,
            '-i', sceneTtsPath,
            '-vf', videoFilterWithAss,
            '-t', sceneDuration.toString(),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
            normalizedScenePath
          ];
        } else {
          ffmpegArgs = [
            '-y',
            '-loop', '1',
            '-i', downloadedAssetPath,
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-vf', videoFilterWithAss,
            '-t', sceneDuration.toString(),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-shortest',
            normalizedScenePath
          ];
        }
      } else {
        let trimOpts: string[] = [];
        if (typeof scene.trimStart === 'number' && scene.trimStart >= 0) {
          trimOpts.push('-ss', scene.trimStart.toString());
        }
        if (typeof scene.trimEnd === 'number' && scene.trimEnd > (scene.trimStart || 0)) {
          trimOpts.push('-to', scene.trimEnd.toString());
        } else if (sceneDuration > 0) {
          trimOpts.push('-t', sceneDuration.toString());
        }

        if (hasTtsAudio) {
          // Use synthesized TTS voice narration as audio track
          ffmpegArgs = [
            '-y',
            ...trimOpts,
            '-i', downloadedAssetPath,
            '-i', sceneTtsPath,
            '-filter_complex', `[0:v]${videoFilterWithAss}[v];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-t', sceneDuration.toString(),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
            normalizedScenePath
          ];
        } else {
          // Use original video audio
          ffmpegArgs = [
            '-y',
            ...trimOpts,
            '-i', downloadedAssetPath,
            '-filter_complex', `[0:v]${videoFilterWithAss}[v];[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-t', sceneDuration.toString(),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-shortest',
            normalizedScenePath
          ];
        }
      }

      updateJobProgress(
        jobId,
        { step: `Renderowanie Sceny ${sceneNum}/${scenes.length} (${animMode})` },
        `FFmpeg nakłada napisy ${animMode} (${highlightCol}) i synchronizuje audio lektora...`
      );

      try {
        await runFfmpegWithProgress(ffmpegArgs, jobId, sceneStartProgress, sceneEndProgress, sceneDuration);
      } catch (err) {
        console.warn(`Scene ${sceneNum} primary render failed, using robust fallback...`, (err as Error).message);
        updateJobProgress(jobId, {}, `Pierwotny filtr sceny ${sceneNum} zawiódł, używanie bezpiecznego renderera...`);

        let trimOptsFallback: string[] = [];
        if (typeof scene.trimStart === 'number' && scene.trimStart >= 0) {
          trimOptsFallback.push('-ss', scene.trimStart.toString());
        }
        if (typeof scene.trimEnd === 'number' && scene.trimEnd > (scene.trimStart || 0)) {
          trimOptsFallback.push('-to', scene.trimEnd.toString());
        }

        const fallbackArgs = [
          '-y',
          ...trimOptsFallback,
          '-i', downloadedAssetPath,
          ...(hasTtsAudio ? ['-i', sceneTtsPath] : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']),
          '-filter_complex', `[0:v]${scaleFilter}[v];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a]`,
          '-map', '[v]',
          '-map', '[a]',
          '-t', sceneDuration.toString(),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          '-shortest',
          normalizedScenePath
        ];
        await runFfmpegWithProgress(fallbackArgs, jobId, sceneStartProgress, sceneEndProgress, sceneDuration);
      }

      processedScenePaths.push(normalizedScenePath);
    }

    // Step: Concatenate Scenes
    updateJobProgress(
      jobId,
      { step: 'Łączenie wszystkich wyrenderowanych scen w jeden plik wideo', progress: 70 },
      'Generowanie listy concat_list.txt i scalanie strumieni wideo...'
    );

    const concatListPath = path.join(jobTempDir, 'concat_list.txt');
    const concatContent = processedScenePaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const mergedVideoPath = path.join(jobTempDir, 'merged_scenes.mp4');
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      mergedVideoPath
    ];

    await runFfmpegWithProgress(concatArgs, jobId, 70, 85, totalEstimatedDuration || 10);

    // Step: Audio Mixing (Background Music)
    updateJobProgress(
      jobId,
      { step: 'Miksowanie ścieżki dźwiękowej i muzyki w tle', progress: 85 },
      'Przetwarzanie finalnego audio wideo...'
    );

    let bgAudioPath = '';
    const bgAudioUrl = payload.audioUrl || payload.backgroundMusicUrl;
    const audioVol = payload.audioVolume ?? 0.3;

    if (bgAudioUrl) {
      bgAudioPath = path.join(jobTempDir, 'bg_music.mp3');
      try {
        updateJobProgress(jobId, {}, `Pobieranie muzyki w tle z URL: ${bgAudioUrl}`);
        await downloadFile(bgAudioUrl, bgAudioPath, jobId);
      } catch (err) {
        updateJobProgress(jobId, {}, `Nie można pobrać muzyki tła: ${(err as Error).message}. Kontynuacja z oryginalnym audio.`);
      }
    }

    const outputFilename = `combined_video_${jobId}.mp4`;
    const finalOutputPath = path.join(EXPORTS_DIR, outputFilename);

    if (fs.existsSync(bgAudioPath)) {
      const mixArgs = [
        '-y',
        '-i', mergedVideoPath,
        '-i', bgAudioPath,
        '-filter_complex', `[0:a]volume=1.0[a1];[1:a]volume=${audioVol}[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', '+faststart',
        finalOutputPath
      ];
      try {
        await runFfmpegWithProgress(mixArgs, jobId, 85, 95, totalEstimatedDuration || 10);
      } catch {
        fs.copyFileSync(mergedVideoPath, finalOutputPath);
      }
    } else {
      fs.copyFileSync(mergedVideoPath, finalOutputPath);
    }

    // Measure Output
    const stats = fs.statSync(finalOutputPath);
    const outputUrl = `${baseUrl}/exports/${outputFilename}`;

    updateJobProgress(
      jobId,
      {
        status: 'completed',
        step: 'Renderowanie zakończone pomyślnie!',
        progress: 100,
        outputUrl,
        outputFilename,
        fileSize: stats.size,
        duration: totalEstimatedDuration
      },
      `✓ Plik wyjściowy MP4 utworzony pomyślnie: ${outputUrl} (${stats.size} bajtów)`
    );

    console.log(`✓ Job ${jobId} completed successfully: ${outputUrl}`);

    // Handle webhook callback if provided in payload
    if (payload.webhookUrl) {
      try {
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
        const webhookPayload = JSON.stringify({
          event: 'video.completed',
          jobId,
          status: 'completed',
          outputUrl,
          fileSize: stats.size,
          fileSizeFormatted: `${sizeMb} MB`,
          duration: totalEstimatedDuration,
          scenesCount: payload.scenes.length,
          outputResolution: resolutionStr,
          completedAt: new Date().toISOString()
        });

        console.log(`📡 Sending completion webhook to Make.com: ${payload.webhookUrl}`);
        const urlObj = new URL(payload.webhookUrl);
        const reqClient = urlObj.protocol === 'https:' ? https : http;
        const req = reqClient.request(payload.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(webhookPayload)
          }
        });
        req.on('error', (e) => console.warn('Webhook dispatch network error:', e.message));
        req.write(webhookPayload);
        req.end();
      } catch (webhookErr) {
        console.warn('Webhook callback error:', (webhookErr as Error).message);
      }
    }
  } catch (error) {
    const errorMsg = (error as Error).message || 'Unknown video processing error';
    console.error(`❌ Error processing job ${jobId}:`, error);
    updateJobProgress(
      jobId,
      {
        status: 'failed',
        error: errorMsg,
        step: 'Błąd podczas wykonywania komendy FFmpeg'
      },
      `❌ Błąd renderowania: ${errorMsg}`
    );

    // Send failure webhook callback if webhookUrl was specified
    if (payload.webhookUrl) {
      try {
        const failPayload = JSON.stringify({
          event: 'video.failed',
          jobId,
          status: 'failed',
          error: errorMsg,
          completedAt: new Date().toISOString()
        });
        const urlObj = new URL(payload.webhookUrl);
        const reqClient = urlObj.protocol === 'https:' ? https : http;
        const req = reqClient.request(payload.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(failPayload)
          }
        });
        req.on('error', (e) => console.warn('Error webhook dispatch network error:', e.message));
        req.write(failPayload);
        req.end();
      } catch (e) {
        console.warn('Failed to send error webhook:', (e as Error).message);
      }
    }
  } finally {
    setTimeout(() => {
      if (fs.existsSync(jobTempDir)) {
        fs.rm(jobTempDir, { recursive: true, force: true }, () => {});
      }
    }, 120000);
  }
}

// REST API ROUTER
const router = express.Router();

// Health Check Endpoint
router.get('/health', async (req, res) => {
  let ffmpegVersion = 'Unknown';
  try {
    const { stdout } = await execPromise('ffmpeg -version');
    ffmpegVersion = stdout.split('\n')[0];
  } catch {
    ffmpegVersion = 'Not installed or error running ffmpeg';
  }

  const fontReady = fs.existsSync(MONTSERRAT_FONT_PATH);

  res.json({
    status: 'online',
    service: 'Make.com HTTP Video Scene Combiner Connector',
    ffmpeg: ffmpegVersion,
    fontStatus: {
      name: 'Montserrat-Bold.ttf',
      ready: fontReady,
      path: MONTSERRAT_FONT_PATH
    },
    activeJobsCount: jobsStore.size,
    timestamp: new Date().toISOString()
  });
});

// Universal helper to extract scenes from multiple payload variations (Polish and English)
function extractScenesFromPayload(body: any): any[] | null {
  if (!body) return null;
  if (Array.isArray(body) && body.length > 0) return body;
  if (typeof body !== 'object') return null;

  const candidates = [
    body.scenes,
    body.sceny,
    body.Sceny,
    body.Scenes,
    body.items,
    body.elements,
    body.data,
    body.lista_scen,
    body.listaScen
  ];

  for (const item of candidates) {
    if (Array.isArray(item) && item.length > 0) {
      return item;
    }
  }

  if (body.payload && typeof body.payload === 'object') {
    const nested = extractScenesFromPayload(body.payload);
    if (nested) return nested;
  }
  if (body.body && typeof body.body === 'object') {
    const nested = extractScenesFromPayload(body.body);
    if (nested) return nested;
  }

  return null;
}

// Universal normalizer for individual scene items (handles Polish and English keys)
function normalizeSceneItem(sc: any, idx: number, totalCount: number): SceneInput {
  if (!sc || typeof sc !== 'object') {
    return {
      subtitles: `SCENA ${idx + 1}`,
      voiceover_text: `SCENA ${idx + 1}`,
      videoUrl: getStockVideoUrl('nature', idx),
      duration: 6
    };
  }

  const videoUrl =
    sc.video_url ||
    sc.videoUrl ||
    sc['adres URL_filmu'] ||
    sc['adres_URL_filmu'] ||
    sc['adres URL'] ||
    sc['adres_url'] ||
    sc.adres_url ||
    sc.adresUrl ||
    sc.url ||
    sc.video ||
    sc.imageUrl ||
    sc.fileUrl ||
    sc.uri ||
    getStockVideoUrl('nature', idx);

  const rawText =
    sc.voiceover_text ??
    sc.subtitles ??
    sc.text ??
    sc.caption ??
    sc['tekst_głosowy'] ??
    sc['tekst_glosowy'] ??
    sc.tekst ??
    sc.napis ??
    sc.tresc ??
    `SCENA ${idx + 1}`;

  const defaultDuration = totalCount === 3 ? 6.0 : Math.max(3.0, Number((18 / (totalCount || 1)).toFixed(1)));
  const duration = Number(
    sc.duration ||
    sc.scene_duration ||
    sc['czas_sceny'] ||
    sc.czas ||
    sc.dlugosc ||
    defaultDuration
  ) || defaultDuration;

  const capStyle = sc.captionStyle || {};

  return {
    subtitles: rawText.toString().trim(),
    voiceover_text: (sc.voiceover_text || sc['tekst_głosowy'] || sc['tekst_glosowy'] || rawText).toString().trim(),
    videoUrl,
    duration,
    captionStyle: {
      position: capStyle.position || sc.position || 'bottom',
      animation: capStyle.animation || sc.animation || 'word-by-word',
      highlightColor: capStyle.highlightColor || sc.highlightColor || 'yellow',
      fontSize: capStyle.fontSize || sc.fontSize || 54,
      outlineWidth: capStyle.outlineWidth || sc.outlineWidth || 6,
      outlineColor: 'black',
      boxColor: 'black@0.6'
    }
  };
}

// Built-in smart viral script engine fallback (activated when Gemini is unavailable or access is restricted)
function buildSmartFallbackScript(topic: string, niche: string, language: string, count: number) {
  const isPl = !language || language.toLowerCase().includes('pol');
  const upper = topic.toUpperCase();
  const dur = count === 3 ? 6.0 : Math.max(3.5, Number((18 / count).toFixed(1)));

  // Determine theme keywords
  const tLower = topic.toLowerCase();
  let theme = 'space galaxy';
  if (tLower.includes('pieniądz') || tLower.includes('biznes') || tLower.includes('finans') || tLower.includes('sukces') || tLower.includes('money')) {
    theme = 'city drone building';
  } else if (tLower.includes('mózg') || tLower.includes('psycholog') || tLower.includes('ai') || tLower.includes('technol') || tLower.includes('komputer')) {
    theme = 'tech cyber robot brain';
  } else if (tLower.includes('auto') || tLower.includes('samochód') || tLower.includes('prędkoś') || tLower.includes('adrenalin') || tLower.includes('speed')) {
    theme = 'speed car fast';
  } else if (tLower.includes('histori') || tLower.includes('wojn') || tLower.includes('starożytn') || tLower.includes('stoic') || tLower.includes('filozof')) {
    theme = 'warrior stoic history';
  } else if (tLower.includes('natura') || tLower.includes('ziemi') || tLower.includes('zwierz') || tLower.includes('ocean') || tLower.includes('las')) {
    theme = 'nature ocean water mountain';
  }

  const hook = isPl ? 'CZY WIESZ, ŻE TO PRAWDA?' : 'DID YOU KNOW THIS IS TRUE?';
  const fact1 = upper.length > 35 ? upper.slice(0, 32) + '...' : upper;
  const fact2 = isPl ? 'NAUKOWCY POTWIERDZAJĄ TEN FAKT!' : 'RESEARCHERS JUST CONFIRMED THIS!';
  const fact3 = isPl ? 'TO CAŁKOWICIE ZMIENIA PERSPEKTYWĘ!' : 'THIS COMPLETELY CHANGES THE GAME!';
  const cta = isPl ? 'SUBSKRYBUJ I NAPISZ CO O TYM MYŚLISZ!' : 'SUBSCRIBE & LEAVE YOUR THOUGHTS!';

  const texts = [
    `${hook}\n${fact1}`,
    fact2,
    fact3,
    cta
  ].slice(0, count);

  const scenes: SceneInput[] = texts.map((txt, idx) => ({
    subtitles: txt,
    duration: dur,
    searchKeyword: theme,
    videoUrl: getStockVideoUrl(theme, idx),
    captionStyle: {
      position: 'bottom' as const,
      fontColor: idx === 0 ? 'yellow' : 'white',
      outlineColor: 'black',
      outlineWidth: 3,
      boxColor: 'black@0.6'
    }
  }));

  return {
    title: topic,
    description: `#shorts #viral #${niche.toLowerCase().replace(/\s+/g, '')} #fyp`,
    hook,
    language,
    scenes,
    backgroundMusicUrl: 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
    audioVolume: 0.3,
    generator: 'smart-template-engine'
  };
}

// Resilient Gemini Model Cascade: Prioritizes fast, reliable models and auto-switches if 503 (high demand) occurs
const GEMINI_MODEL_CASCADE = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

async function callGeminiWithCascade(params: {
  contents: string;
  config?: any;
}): Promise<{ text: string; modelUsed: string } | null> {
  let lastError: Error | null = null;
  for (const model of GEMINI_MODEL_CASCADE) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config
      });
      if (response && response.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.log(`[Gemini Cascade] Model ${model} returned: ${errMsg.slice(0, 90)}... Auto-switching to next model in cascade.`);
    }
  }
  if (lastError) {
    console.warn(`[Gemini Cascade Fallback] All Gemini models exhausted (${lastError.message}). Using optimized heuristic generator.`);
  }
  return null;
}

// Resilient Script Generator (Tries Gemini Model Cascade, gracefully falls back to smart template on any API error)
async function generateSmartOrGeminiViralScript({
  topic = '5 Niesamowitych faktów o świecie',
  niche = 'Viral Shorts',
  language = 'Polski',
  sceneCount = 4
}: {
  topic?: string;
  niche?: string;
  language?: string;
  sceneCount?: number;
}) {
  const cleanTopic = (topic || 'Niesamowite fakty').trim();
  const count = Math.min(Math.max(Number(sceneCount) || 3, 2), 6);

  try {
    const prompt = `Jesteś ekspertem viralowych filmów YouTube Shorts / TikTok. Stwórz porywający, gotowy scenariusz na krótki wideo-short (9:16) w języku: ${language} na temat: "${cleanTopic}" (Kategoria: ${niche}).
Wymagania:
1. "title": Chwytliwy, wiralowy tytuł filmu w języku (${language})
2. "description": Krótki opis w języku (${language}) z najpopularniejszymi hashtagami (#shorts #viral #fyp #${niche.toLowerCase().replace(/\s+/g, '')})
3. "hook": Silny otwierający hook (1 zdanie) w języku (${language})
4. "scenes": Tablica zawierająca ${count} obiekty scen z polami:
   - "subtitles": Krótki, uderzający napis (3 do 6 słów, DUŻE LITERY) w języku (${language}) do wyświetlenia na filmie (np. "CZY WIESZ ŻE W KOSMOSIE...", "MÓZG DZIENNIE PRODUKUJE...")
   - "duration": Czas trwania sceny w sekundach (od 4.0 do 6.0)
   - "searchKeyword": Angielskie słowo kluczowe klimatu tła do szukania filmu wideo (np. "space galaxy", "cyberpunk city", "ocean sunset", "drone nature", "fast car", "futuristic brain", "stoic statue")
   - "captionStyle": { position: "bottom", fontColor: "yellow" lub "white", outlineColor: "black", boxColor: "black@0.6" }
5. "backgroundMusicUrl": "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3"
6. "audioVolume": 0.3`;

    const geminiResult = await callGeminiWithCascade({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            hook: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subtitles: { type: Type.STRING },
                  duration: { type: Type.NUMBER },
                  searchKeyword: { type: Type.STRING },
                  captionStyle: {
                    type: Type.OBJECT,
                    properties: {
                      position: { type: Type.STRING },
                      fontColor: { type: Type.STRING },
                      outlineColor: { type: Type.STRING },
                      boxColor: { type: Type.STRING }
                    }
                  }
                },
                required: ['subtitles', 'duration', 'searchKeyword']
              }
            },
            backgroundMusicUrl: { type: Type.STRING },
            audioVolume: { type: Type.NUMBER }
          },
          required: ['title', 'description', 'scenes']
        }
      }
    });

    if (geminiResult && geminiResult.text) {
      const parsed = JSON.parse(geminiResult.text);
      if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
        const scenesWithVideo = parsed.scenes.map((sc: any, idx: number) => ({
          ...sc,
          videoUrl: getStockVideoUrl(sc.searchKeyword, idx),
          captionStyle: sc.captionStyle || {
            position: 'bottom',
            fontColor: idx === 0 ? 'yellow' : 'white',
            outlineColor: 'black',
            outlineWidth: 3,
            boxColor: 'black@0.6'
          }
        }));

        return {
          title: parsed.title || cleanTopic,
          description: parsed.description || `#shorts #${niche.toLowerCase()} #viral #fyp`,
          hook: parsed.hook || parsed.scenes?.[0]?.subtitles || cleanTopic,
          language,
          scenes: scenesWithVideo,
          backgroundMusicUrl: parsed.backgroundMusicUrl || 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
          audioVolume: parsed.audioVolume || 0.3,
          generator: geminiResult.modelUsed
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ [Gemini Script Catch] Processing error (' + (err as Error).message + '). Generating optimized heuristic viral script.');
  }

  return buildSmartFallbackScript(cleanTopic, niche, language, count);
}

// Resilient Translation Generator (Tries Gemini Model Cascade, gracefully falls back on API error)
async function translateSmartOrGeminiScript({
  scriptText,
  targetLanguage = 'Polski',
  sceneCount = 4
}: {
  scriptText: string;
  targetLanguage?: string;
  sceneCount?: number;
}) {
  const count = Math.min(Math.max(Number(sceneCount) || 3, 2), 6);

  try {
    const prompt = `Jesteś ekspertem automatycznego tłumaczenia i tworzenia wiralowych napisów do filmów wideo (Shorts / TikTok / Reels).
Przetłumacz i podziel poniższy tekst / transkrypcję z nagrania wideo na język: "${targetLanguage}".
Podziel go na ${count} krótkich, dynamicznych scen z uderzającymi napisami (DUŻE LITERY, 3-6 słów na scenę) oraz dobierz angielskie słowa kluczowe tła wideo dla każdej sceny.

Tekst do przetłumaczenia:
"${scriptText}"

Wymagania JSON:
1. "title": Chwytliwy przetłumaczony tytuł filmu
2. "description": Opis i hashtagi w języku ${targetLanguage}
3. "hook": Przetłumaczony otwierający nagłówek
4. "scenes": Tablica zawierająca ${count} scen z:
   - "subtitles": Przetłumaczony krótki napis (DUŻE LITERY)
   - "duration": Czas trwania w sekundach (od 4.0 do 6.0)
   - "searchKeyword": Angielskie słowa kluczowe pasujące do sensu wypowiedzi (np. "person speaking microphone", "city skyline", "universe stars", "question mark thinking")`;

    const geminiResult = await callGeminiWithCascade({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            hook: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subtitles: { type: Type.STRING },
                  duration: { type: Type.NUMBER },
                  searchKeyword: { type: Type.STRING }
                },
                required: ['subtitles', 'duration', 'searchKeyword']
              }
            }
          },
          required: ['title', 'scenes']
        }
      }
    });

    if (geminiResult && geminiResult.text) {
      const parsed = JSON.parse(geminiResult.text);
      if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
        const scenesWithVideo = parsed.scenes.map((sc: any, idx: number) => ({
          subtitles: sc.subtitles || `SCENA ${idx + 1}`,
          duration: sc.duration || 5,
          searchKeyword: sc.searchKeyword || 'video background',
          videoUrl: getStockVideoUrl(sc.searchKeyword, idx),
          captionStyle: {
            position: 'bottom' as const,
            fontColor: idx === 0 ? 'yellow' : 'white',
            outlineColor: 'black',
            outlineWidth: 3,
            boxColor: 'black@0.6'
          }
        }));

        return {
          success: true,
          targetLanguage,
          title: parsed.title || 'Przetłumaczone Wideo Short',
          description: parsed.description || `#shorts #translation #${targetLanguage.toLowerCase()}`,
          hook: parsed.hook || parsed.scenes?.[0]?.subtitles || '',
          scenes: scenesWithVideo,
          backgroundMusicUrl: 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
          audioVolume: 0.3,
          generator: geminiResult.modelUsed
        };
      }
    }
  } catch (err) {
    console.warn('⚠️ [Gemini Translation Fallback] Gemini translation error (' + (err as Error).message + '). Splitting script text intelligently.');
  }

  const cleaned = scriptText.replace(/\r?\n/g, ' ').trim();
  const sentences = cleaned.split(/(?<=[.?!])\s+/).filter(Boolean);
  const dur = count === 3 ? 6.0 : Math.max(3.5, Number((18 / count).toFixed(1)));

  let parts: string[] = [];
  if (sentences.length >= count) {
    parts = sentences.slice(0, count);
  } else {
    const words = cleaned.split(/\s+/);
    const wordsPerChunk = Math.ceil(words.length / count);
    for (let i = 0; i < count; i++) {
      const chunk = words.slice(i * wordsPerChunk, (i + 1) * wordsPerChunk).join(' ');
      if (chunk) parts.push(chunk);
    }
  }

  while (parts.length < count) {
    parts.push(`SCENA ${parts.length + 1}`);
  }

  const scenesWithVideo = parts.map((chunk, idx) => ({
    subtitles: chunk.toUpperCase(),
    duration: dur,
    searchKeyword: 'tech cyber nature',
    videoUrl: getStockVideoUrl('cyber', idx),
    captionStyle: {
      position: 'bottom',
      fontColor: idx === 0 ? 'yellow' : 'white',
      outlineColor: 'black',
      outlineWidth: 3,
      boxColor: 'black@0.6'
    }
  }));

  return {
    success: true,
    targetLanguage,
    title: parts[0]?.slice(0, 30) || 'Short Video',
    description: `#shorts #translation #${targetLanguage.toLowerCase()}`,
    hook: parts[0] || '',
    scenes: scenesWithVideo,
    backgroundMusicUrl: 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
    audioVolume: 0.3,
    generator: 'smart-template-engine'
  };
}

// Endpoint: AI Script & Shorts Generator (/api/generate-viral-script)
router.post('/generate-viral-script', async (req, res) => {
  try {
    const { topic = 'Niesamowite fakty o kosmosie', niche = 'Ciekawostki', sceneCount = 4, language = 'Polski' } = req.body;
    const script = await generateSmartOrGeminiViralScript({ topic, niche, sceneCount, language });
    return res.json(script);
  } catch (error) {
    console.error('Error generating viral script:', error);
    return res.status(500).json({
      error: 'Błąd generowania skryptu:',
      details: (error as Error).message
    });
  }
});

// Endpoint: Video Script Translation & Localized Short Generator (/api/translate-video-script)
router.post('/translate-video-script', async (req, res) => {
  try {
    const { scriptText, targetLanguage = 'Polski', sceneCount = 4 } = req.body;

    if (!scriptText || typeof scriptText !== 'string') {
      return res.status(400).json({ error: 'Brak tekstu skryptu do przetłumaczenia.' });
    }

    const translated = await translateSmartOrGeminiScript({ scriptText, targetLanguage, sceneCount });
    return res.json(translated);
  } catch (error) {
    console.error('Error translating video script:', error);
    return res.status(500).json({
      error: 'Błąd tłumaczenia skryptu wideo:',
      details: (error as Error).message
    });
  }
});

// Endpoint: Zero-Touch Auto-Pilot Shorts Generator (/api/auto-pilot-shorts)
router.post('/auto-pilot-shorts', async (req, res) => {
  try {
    const body = req.body;
    console.log('[POST /api/auto-pilot-shorts] Otrzymane dane payload:', JSON.stringify(body, null, 2));

    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        error: 'Nieprawidłowe żądanie HTTP. Oczekiwany poprawny obiekt JSON.',
        example: {
          filename: 'moj_short.mp4',
          transition: 'fade',
          scenes: [
            { text: 'PIERWSZY NIESAMOWITY FAKT', video_url: 'https://example.com/video1.mp4' },
            { text: 'DRUGI FAKT O ŚWIECIE', video_url: 'https://example.com/video2.mp4' },
            { text: 'SUBSKRYBUJ PO WIĘCEJ', video_url: 'https://example.com/video3.mp4' }
          ]
        }
      });
    }

    const { filename, transition, topic, niche = 'Viral Shorts', language = 'Polski', outputResolution = '720x1280' } = body;
    const webhookUrl = getConfiguredMakeWebhookUrl();
    let scenesToRender: SceneInput[] = [];
    let title = filename || 'Make.com Short Video';
    let description = `#shorts #viral #${niche.toLowerCase().replace(/\s+/g, '')}`;
    let scriptData: any = null;

    // 1. Sprawdź, czy przekazano gotową tablicę scen (wspiera: scenes, sceny, Sceny, items itp.)
    const rawScenesList = extractScenesFromPayload(body);

    if (rawScenesList && rawScenesList.length > 0) {
      scenesToRender = rawScenesList.map((sc: any, idx: number) =>
        normalizeSceneItem(sc, idx, rawScenesList.length)
      );

      console.log(`✓ Przyjęto ${scenesToRender.length} scen z Make.com (łączny czas: ${scenesToRender.reduce((a, b) => a + (b.duration || 6), 0)}s)`);
    } else {
      // 2. Jeśli Make przesłało temat (lub brak scen), wygeneruj scenariusz (odporny silnik AI + Smart Fallback)
      const topicToUse = topic || '5 Niesamowitych faktów o świecie';
      scriptData = await generateSmartOrGeminiViralScript({
        topic: topicToUse,
        niche,
        language,
        sceneCount: body.sceneCount || 3
      });

      title = scriptData.title || topicToUse;
      description = scriptData.description || description;
      scenesToRender = scriptData.scenes;
    }

    const payload: CombineScenesPayload = {
      scenes: scenesToRender,
      backgroundMusicUrl: body.backgroundMusicUrl || 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
      audioVolume: body.audioVolume ?? 0.2,
      outputResolution,
      fps: 30,
      async: body.async === true || req.query.async === 'true',
      webhookUrl,
      tts: body.tts !== false,
      ttsLanguage: body.ttsLanguage || language || 'pl',
      ttsSpeed: body.ttsSpeed || 1.0,
      syncDurationWithVoice: body.syncDurationWithVoice !== false,
      captionAnimation: body.captionAnimation || body.animation || 'word-by-word',
      highlightColor: body.highlightColor || 'yellow'
    };

    const jobId = `job_make_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const baseUrl = getPublicBaseUrl(req);

    const newJob: Job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      step: 'Przetwarzanie żądania z Make.com: weryfikacja scen i renderowanie FFmpeg',
      logs: [`[${new Date().toLocaleTimeString()}] Odebrano zadanie z Make.com (${scenesToRender.length} scen)`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    jobsStore.set(jobId, newJob);
    saveJobsToDisk();

    // Jeśli włączony tryb asynchroniczny (async=true), zwróć status 202
    if (payload.async) {
      processCombineScenesJob(jobId, payload, baseUrl);
      return res.status(202).json({
        success: true,
        message: 'Zadanie Make.com zostało zakolejkowane.',
        jobId,
        script: scriptData,
        statusUrl: `${baseUrl}/api/jobs/${jobId}`,
        streamUrl: `${baseUrl}/api/jobs/${jobId}/stream`
      });
    } else {
      // Domyślnie dla Make.com: przetwarzaj synchronicznie i zwróć bezpośredni URL do gotowego pliku MP4!
      await processCombineScenesJob(jobId, payload, baseUrl);
      const completedJob = jobsStore.get(jobId);

      if (completedJob?.status === 'completed') {
        return res.json({
          success: true,
          title,
          description,
          jobId,
          script: scriptData,
          filename: filename || completedJob.outputFilename,
          outputUrl: completedJob.outputUrl,
          fileSize: completedJob.fileSize,
          duration: completedJob.duration || 18,
          scenesCount: scenesToRender.length,
          timestamp: completedJob.updatedAt
        });
      } else {
        return res.status(500).json({
          error: 'Renderowanie wideo FFmpeg zakończyło się błędem.',
          jobId,
          details: completedJob?.error || 'Nieznany błąd podczas montowania filmu MP4'
        });
      }
    }
  } catch (err) {
    console.error('❌ Endpoint /api/auto-pilot-shorts error:', err);
    return res.status(500).json({
      error: 'Błąd serwera podczas przetwarzania żądania Make.com:',
      details: (err as Error).message
    });
  }
});

// Main Endpoint: Combine Scenes (/api/combine-scenes)
router.post('/combine-scenes', async (req, res) => {
  const body = req.body || {};
  let scenesList = extractScenesFromPayload(body);

  if (!scenesList || scenesList.length === 0) {
    return res.status(400).json({
      error: 'Invalid payload. "scenes" array is required with at least 1 scene object.',
      example: {
        scenes: [
          {
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            subtitles: 'NATURE SCENE 1',
            duration: 4,
            captionStyle: { fontSize: 32, fontColor: 'white', position: 'bottom' }
          }
        ],
        outputResolution: '720x1280',
        audioVolume: 0.3
      }
    });
  }

  const normalizedScenes = scenesList.map((sc: any, idx: number) =>
    normalizeSceneItem(sc, idx, scenesList!.length)
  );

  const payload: CombineScenesPayload = {
    scenes: normalizedScenes,
    backgroundMusicUrl: body.backgroundMusicUrl || '',
    audioVolume: body.audioVolume ?? (body.tts !== false ? 0.2 : 0.3),
    outputResolution: body.outputResolution || body.resolution || '720x1280',
    fps: body.fps || 30,
    async: body.async === true || req.query.async === 'true',
    webhookUrl: getConfiguredMakeWebhookUrl(),
    tts: body.tts !== false,
    ttsLanguage: body.ttsLanguage || body.language || 'pl',
    ttsSpeed: body.ttsSpeed || 1.0,
    syncDurationWithVoice: body.syncDurationWithVoice !== false,
    captionAnimation: body.captionAnimation || body.animation || 'word-by-word',
    highlightColor: body.highlightColor || 'yellow'
  };

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const baseUrl = getPublicBaseUrl(req);

  const newJob: Job = {
    id: jobId,
    status: 'queued',
    progress: 0,
    step: 'Zadanie odebrane i zakolejkowane',
    logs: [`[${new Date().toLocaleTimeString()}] Utworzono nowe zadanie renderowania ${jobId}`],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  jobsStore.set(jobId, newJob);
  saveJobsToDisk();

  const isAsync = payload.async === true || Boolean(payload.webhookUrl);

  if (isAsync) {
    processCombineScenesJob(jobId, payload, baseUrl);
    return res.status(202).json({
      message: 'Video combination job created successfully.',
      jobId,
      statusUrl: `${baseUrl}/api/jobs/${jobId}`,
      streamUrl: `${baseUrl}/api/jobs/${jobId}/stream`,
      status: 'queued'
    });
  } else {
    await processCombineScenesJob(jobId, payload, baseUrl);
    const completedJob = jobsStore.get(jobId);

    if (completedJob?.status === 'completed') {
      return res.json({
        success: true,
        jobId,
        outputUrl: completedJob.outputUrl,
        filename: completedJob.outputFilename,
        fileSize: completedJob.fileSize,
        step: completedJob.step,
        timestamp: completedJob.updatedAt
      });
    } else {
      return res.status(500).json({
        success: false,
        jobId,
        error: completedJob?.error || 'Video rendering failed',
        step: completedJob?.step
      });
    }
  }
});

// Explicit Download Endpoint for generated MP4 files
router.get('/jobs/:jobId/download', (req, res) => {
  const { jobId } = req.params;
  const job = jobsStore.get(jobId);

  if (!job || !job.outputFilename) {
    return res.status(404).json({ error: `Nie znaleziono pliku wideo dla zadania ${jobId}` });
  }

  const filePath = path.join(EXPORTS_DIR, job.outputFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Plik fizyczny wideo wygasł lub został usunięty z serwera.' });
  }

  res.download(filePath, job.outputFilename);
});

router.get('/exports/:filename/download', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(EXPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Plik nie istnieje na serwerze.' });
  }

  res.download(filePath, filename);
});

// Real-time Event Stream Endpoint (Server-Sent Events) (/api/jobs/:jobId/stream)
router.get('/jobs/:jobId/stream', (req, res) => {
  const { jobId } = req.params;
  const job = jobsStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job with ID ${jobId} not found.` });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Send initial snapshot
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  if (!sseSubscribers.has(jobId)) {
    sseSubscribers.set(jobId, new Set());
  }
  sseSubscribers.get(jobId)!.add(res);

  req.on('close', () => {
    const subs = sseSubscribers.get(jobId);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) sseSubscribers.delete(jobId);
    }
  });
});

// Webhook memory store for incoming Make.com / API webhooks
interface WebhookLog {
  id: string;
  endpoint: string;
  method: string;
  headers: Record<string, any>;
  body: any;
  jobId?: string;
  status: 'received' | 'processed' | 'error';
  errorMessage?: string;
  timestamp: string;
}

const webhookLogsStore: WebhookLog[] = [];

// Helper to record webhooks
function recordWebhookLog(endpoint: string, method: string, headers: any, body: any, jobId?: string, status: 'received' | 'processed' | 'error' = 'received', errorMessage?: string): WebhookLog {
  const log: WebhookLog = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    endpoint,
    method,
    headers: { 'content-type': headers['content-type'], 'user-agent': headers['user-agent'] },
    body,
    jobId,
    status,
    errorMessage,
    timestamp: new Date().toISOString()
  };
  webhookLogsStore.unshift(log);
  if (webhookLogsStore.length > 50) webhookLogsStore.pop(); // Keep last 50
  return log;
}

// Inbound Universal Webhook Handler (/api/webhook & /api/webhook/make)
const handleInboundWebhook = async (req: express.Request, res: express.Response) => {
  const endpoint = req.originalUrl || req.path;
  const body = req.body || {};
  console.log(`[Webhook Inbound ${req.method} ${endpoint}] Payload:`, JSON.stringify(body, null, 2));

  let jobId: string | undefined;

  try {
    const rawScenes = extractScenesFromPayload(body);
    const hasScenes = Array.isArray(rawScenes) && rawScenes.length > 0;
    const hasSingleVideo = body.video_url || body.videoUrl;
    const hasTopic = Boolean(body.topic || body.prompt || body.text);

    if (hasScenes || hasSingleVideo || hasTopic) {
      // Auto-construct scenes
      let scenesToRender: SceneInput[] = [];
      if (hasScenes && rawScenes) {
        scenesToRender = rawScenes.map((sc: any, idx: number) =>
          normalizeSceneItem(sc, idx, rawScenes.length)
        );
      } else if (hasSingleVideo) {
        scenesToRender = [normalizeSceneItem({
          text: body.text || body.subtitles || body.caption || 'NOWY SHORT',
          video_url: body.video_url || body.videoUrl,
          duration: body.duration || 10
        }, 0, 1)];
      } else if (hasTopic) {
        // Smart fallback script for topic
        const topicName = body.topic || body.prompt || 'Fascynujący świat AI';
        const smartScript = buildSmartFallbackScript(topicName, 'Viral Shorts', 'Polski', 3);
        scenesToRender = smartScript.scenes;
      }

      const baseUrl = getPublicBaseUrl(req);
      jobId = `job_wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payload: CombineScenesPayload = {
        scenes: scenesToRender,
        backgroundMusicUrl: body.backgroundMusicUrl || 'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
        audioVolume: body.audioVolume ?? (body.tts !== false ? 0.2 : 0.3),
        outputResolution: body.outputResolution || body.resolution || '720x1280',
        fps: 30,
        async: true,
        webhookUrl: getConfiguredMakeWebhookUrl(),
        tts: body.tts !== false,
        ttsLanguage: body.ttsLanguage || body.language || 'pl',
        ttsSpeed: body.ttsSpeed || 1.0,
        syncDurationWithVoice: body.syncDurationWithVoice !== false,
        captionAnimation: body.captionAnimation || body.animation || 'word-by-word',
        highlightColor: body.highlightColor || 'yellow'
      };

      const newJob: Job = {
        id: jobId,
        status: 'queued',
        progress: 0,
        step: 'Webhook odebrany: uruchamianie renderowania MP4',
        logs: [`[${new Date().toLocaleTimeString()}] Odebrano wywołanie Webhook z Make.com (${scenesToRender.length} scen)`],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      jobsStore.set(jobId, newJob);
      saveJobsToDisk();

      // Start asynchronous job
      processCombineScenesJob(jobId, payload, baseUrl);

      const log = recordWebhookLog(endpoint, req.method, req.headers, body, jobId, 'processed');

      return res.status(200).json({
        success: true,
        message: 'Webhook został przyjęty i przetworzony pomyślnie!',
        webhookId: log.id,
        jobId,
        scenesCount: scenesToRender.length,
        statusUrl: `${baseUrl}/api/jobs/${jobId}`,
        streamUrl: `${baseUrl}/api/jobs/${jobId}/stream`,
        timestamp: log.timestamp
      });
    } else {
      // Just record raw payload (e.g. test ping)
      const log = recordWebhookLog(endpoint, req.method, req.headers, body, undefined, 'received');

      return res.status(200).json({
        success: true,
        message: 'Webhook odebrany pomyślnie (brak zdefiniowanych scen/tematu do renderowania).',
        webhookId: log.id,
        receivedBody: body,
        timestamp: log.timestamp
      });
    }
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error(`❌ Webhook handler error on ${endpoint}:`, err);
    const log = recordWebhookLog(endpoint, req.method, req.headers, body, jobId, 'error', errorMsg);

    return res.status(500).json({
      error: 'Błąd podczas przetwarzania Webhooka:',
      details: errorMsg,
      webhookId: log.id
    });
  }
};

router.post('/webhook', handleInboundWebhook);
router.post('/webhook/make', handleInboundWebhook);

// Generic Webhook Callback / Target endpoint (e.g., for test notifications)
router.post('/webhook/callback', (req, res) => {
  const log = recordWebhookLog('/api/webhook/callback', req.method, req.headers, req.body, undefined, 'received');
  res.json({
    success: true,
    message: 'Odebrano callback webhooka!',
    webhookId: log.id,
    timestamp: log.timestamp
  });
});

// GET /api/webhook/logs - Fetch all recorded webhooks
router.get('/webhook/logs', (req, res) => {
  res.json({
    count: webhookLogsStore.length,
    logs: webhookLogsStore
  });
});

// DELETE /api/webhook/logs - Clear logs
router.delete('/webhook/logs', (req, res) => {
  webhookLogsStore.length = 0;
  res.json({ success: true, message: 'Historia logów webhooków została wyczyszczona.' });
});

// GET /api/tts/stream - Stream synthesized voice speech directly for preview
router.get('/tts/stream', (req, res) => {
  try {
    const rawText = ((req.query.text as string) || 'Cześć! To jest podgląd lektora sztucznej inteligencji.').trim();
    const lang = normalizeLanguageCode((req.query.lang as string) || 'pl');
    const safeText = encodeURIComponent(rawText.slice(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${safeText}&tl=${lang}&client=tw-ob`;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (ttsRes) => {
      ttsRes.pipe(res);
    }).on('error', (err) => {
      res.status(500).json({ error: 'Błąd streamingu TTS', details: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: 'Błąd żądania TTS', details: (err as Error).message });
  }
});

// POST /api/tts/preview - Generate sample audio file and return preview metrics
router.post('/tts/preview', async (req, res) => {
  try {
    const { text, language = 'pl' } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Pole "text" jest wymagane do wygenerowania próbki lektora.' });
    }

    const cleanLang = normalizeLanguageCode(language);
    const previewFilename = `tts_preview_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp3`;
    const destPath = path.join(EXPORTS_DIR, previewFilename);

    const duration = await generateTtsAudio(text.trim(), cleanLang, destPath, TEMP_DIR);
    const baseUrl = getPublicBaseUrl(req);

    res.json({
      success: true,
      text: text.trim(),
      language: cleanLang,
      duration: Math.round(duration * 100) / 100,
      audioUrl: `${baseUrl}/exports/${previewFilename}`,
      streamUrl: `${baseUrl}/api/tts/stream?text=${encodeURIComponent(text.trim().slice(0, 200))}&lang=${cleanLang}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Błąd generowania próbki lektora TTS', details: (err as Error).message });
  }
});

// Get All Recent and Active Jobs (/api/jobs)
router.get('/jobs', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const jobs = Array.from(jobsStore.values()).map((job) => {
    if (job.outputFilename) {
      return {
        ...job,
        outputUrl: `${baseUrl}/exports/${job.outputFilename}`
      };
    }
    return job;
  }).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(jobs);
});

// Job Status Check Endpoint (/api/jobs/:jobId)
router.get('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const baseUrl = getPublicBaseUrl(req);
  const job = jobsStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: `Job with ID ${jobId} not found.` });
  }

  const normalizedJob = job.outputFilename ? {
    ...job,
    outputUrl: `${baseUrl}/exports/${job.outputFilename}`
  } : job;

  res.json(normalizedJob);
});

// Delete Single Job (/api/jobs/:jobId)
router.delete('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobsStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: `Nie znaleziono zadania ${jobId}` });
  }

  if (job.outputFilename) {
    const filePath = path.join(EXPORTS_DIR, job.outputFilename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.warn(`Nie można usunąć pliku MP4 ${filePath}:`, (e as Error).message);
      }
    }
  }

  jobsStore.delete(jobId);
  saveJobsToDisk();

  res.json({ success: true, message: `Zadanie ${jobId} zostało usunięte z historii.` });
});

// Clear Jobs History (/api/jobs)
router.delete('/jobs', (req, res) => {
  const mode = req.query.mode;
  if (mode === 'all') {
    jobsStore.clear();
  } else {
    for (const [id, job] of jobsStore.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        jobsStore.delete(id);
      }
    }
  }
  saveJobsToDisk();
  res.json({ success: true, message: 'Historia renderowania została pomyślnie wyczyszczona.' });
});

// Mount API router
app.use('/api', router);

// Start Express + Vite Server
async function startServer() {
  loadJobsFromDisk();
  ensureMontserratFont().catch(console.error);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Video Combiner Express Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
