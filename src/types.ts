export interface CaptionStyle {
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  boxColor?: string;
  position?: 'bottom' | 'center' | 'top';
  alignment?: 'center' | 'left' | 'right';
}

export interface Scene {
  id: string;
  videoUrl: string;
  imageUrl?: string;
  duration?: number;
  subtitles: string;
  captionStyle: CaptionStyle;
  trimStart?: number;
  trimEnd?: number;
}

export interface CombinePayload {
  scenes: {
    videoUrl?: string;
    imageUrl?: string;
    duration?: number;
    subtitles?: string;
    captionStyle?: CaptionStyle;
    trimStart?: number;
    trimEnd?: number;
  }[];
  audioUrl?: string;
  backgroundMusicUrl?: string;
  audioVolume?: number;
  outputResolution?: string;
  fps?: number;
  async?: boolean;
  webhookUrl?: string;
}

export interface SystemHealth {
  status: string;
  service: string;
  ffmpeg: string;
  fontStatus: {
    name: string;
    ready: boolean;
    path: string;
  };
  activeJobsCount: number;
  timestamp: string;
}

export interface JobStatusResponse {
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

export interface ViralScriptRequest {
  topic?: string;
  niche?: string;
  language?: string;
  sceneCount?: number;
}

export interface ViralScene {
  subtitles: string;
  duration: number;
  searchKeyword: string;
  videoUrl: string;
  captionStyle: CaptionStyle;
  trimStart?: number;
  trimEnd?: number;
}

export interface ViralScriptResponse {
  title: string;
  description: string;
  hook: string;
  scenes: ViralScene[];
  backgroundMusicUrl: string;
  audioVolume: number;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}
