
export type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1';
export type ImageResolution = '1K' | '2K' | '4K';

export enum VisualStyle {
  CINEMATIC = 'Realistic Cinematic',
  SKETCH = 'Pencil Sketch',
  NOIR = 'Film Noir',
  ANIME = 'Anime Style',
  RENDER_3D = '3D Render',
  WATERCOLOR = 'Watercolor',
  CYBERPUNK = 'Cyberpunk'
}

export interface CharacterProfile {
  name: string;
  description: string;
}

export interface StoryPanel {
  id: string;
  panelNumber: number;
  visualDescription: string;
  shotType?: string; // e.g. "Close-up", "Wide Shot"
  dialogue: string;
  imageUrl?: string;
  videoUrl?: string;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  isPlayingAudio: boolean;
}

export interface AnalysisResult {
  panels: StoryPanel[];
  characters: CharacterProfile[];
}

export enum AppMode {
  STORYBOARD = 'STORYBOARD',
  RESEARCH = 'RESEARCH',
  LIVE_DIRECTOR = 'LIVE_DIRECTOR',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingSources?: Array<{
    title: string;
    url: string;
  }>;
}

export interface GeminiConfig {
  apiKey: string;
}

// Augment window for AI Studio helpers
declare global {
  interface AIStudio {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
