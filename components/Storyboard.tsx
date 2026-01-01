import React, { useState } from 'react';
import { StoryPanel, VisualStyle, AspectRatio, CharacterProfile, ImageResolution } from '../types';
import { generatePanelImage, generateSpeech, editPanelImage, generateVideoFromImage } from '../services/geminiService';
import { 
    Play, 
    Image as ImageIcon, 
    Loader2, 
    Volume2, 
    Download, 
    Maximize2, 
    Printer, 
    RefreshCcw,
    Edit3,
    Film,
    Wand2
} from 'lucide-react';

interface StoryboardProps {
  panels: StoryPanel[];
  setPanels: React.Dispatch<React.SetStateAction<StoryPanel[]>>;
  currentStyle: VisualStyle;
  currentRatio: AspectRatio;
  currentResolution: ImageResolution | null; // Null means "Standard" (Flash)
  characters: CharacterProfile[];
}

export const Storyboard: React.FC<StoryboardProps> = ({ 
    panels, 
    setPanels, 
    currentStyle, 
    currentRatio, 
    currentResolution,
    characters 
}) => {
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");

  const handleGenerateImage = async (panel: StoryPanel) => {
    setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingImage: true } : p));
    
    // Standard generation (not editing existing image)
    const imageUrl = await generatePanelImage(
        panel, 
        currentStyle, 
        currentRatio, 
        characters,
        currentResolution || undefined
    );
    
    setPanels(prev => prev.map(p => p.id === panel.id ? { 
        ...p, 
        imageUrl: imageUrl || undefined, 
        isGeneratingImage: false
    } : p));
  };

  const handleEditImage = async (panel: StoryPanel, prompt: string) => {
      if (!panel.imageUrl) return;

      setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingImage: true } : p));
      
      // Use the edit service which takes the existing image and modifies it
      const imageUrl = await editPanelImage(panel.imageUrl, prompt);
      
      setPanels(prev => prev.map(p => p.id === panel.id ? { 
          ...p, 
          imageUrl: imageUrl || undefined, 
          isGeneratingImage: false,
          // Update description slightly to reflect user intervention for history? 
          // Or keep original to preserve script intent. Let's keep original for now.
      } : p));
      
      setEditingPanelId(null);
  };

  const handleAnimatePanel = async (panel: StoryPanel) => {
      if (!panel.imageUrl) return;

      setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingVideo: true } : p));
      
      const videoUrl = await generateVideoFromImage(panel.imageUrl, currentRatio);
      
      setPanels(prev => prev.map(p => p.id === panel.id ? { 
          ...p, 
          videoUrl: videoUrl || undefined, 
          isGeneratingVideo: false
      } : p));
  };

  const handleGenerateAll = async () => {
      const promises = panels.map(async (panel) => {
          if (!panel.imageUrl) {
               return handleGenerateImage(panel);
          }
      });
      await Promise.all(promises);
  };

  const handlePlayAudio = async (panelId: string, text: string) => {
    if (!text) return;
    
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isPlayingAudio: true } : p));
    
    try {
        const rawAudioBuffer = await generateSpeech(text);
        
        if (rawAudioBuffer) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const pcm16 = new Int16Array(rawAudioBuffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0;
            }
            
            const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            
            source.onended = () => {
                 setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isPlayingAudio: false } : p));
                 if (ctx.state !== 'closed') ctx.close();
            };
            
            source.start();
        } else {
            setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isPlayingAudio: false } : p));
        }
    } catch (e) {
        console.error("Audio playback error:", e);
        setPanels(prev => prev.map(p => p.id === panelId ? { ...p, isPlayingAudio: false } : p));
    }
  };

  const getAspectRatioClass = (ratio: AspectRatio) => {
      switch(ratio) {
          case '16:9': return 'aspect-video';
          case '9:16': return 'aspect-[9/16]';
          case '4:3': return 'aspect-[4/3]';
          case '1:1': return 'aspect-square';
          default: return 'aspect-video';
      }
  };

  const handlePrint = () => {
      window.print();
  };

  if (panels.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>No scenes generated yet. Analyze a script to begin.</p>
          </div>
      );
  }

  return (
    <div className="h-full overflow-y-auto p-6 md:p-10 print:p-0 print:overflow-visible bg-gray-950">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            #storyboard-content, #storyboard-content * { visibility: visible; }
            #storyboard-content { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            .page-break { page-break-inside: avoid; }
          }
        `}
      </style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 no-print">
        <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Storyboard</h2>
            <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-400 text-sm">{currentStyle} • {currentRatio}</p>
                {currentResolution && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 font-bold">{currentResolution}</span>}
            </div>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={handlePrint}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-all flex items-center gap-2 border border-gray-700"
            >
                <Printer className="w-4 h-4" />
                Export PDF
            </button>
            <button 
                onClick={handleGenerateAll}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg font-medium transition-all flex items-center gap-2"
            >
                <ImageIcon className="w-4 h-4" />
                Generate All Images
            </button>
        </div>
      </div>

      <div id="storyboard-content" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
        {panels.map((panel) => (
          <div key={panel.id} className="group bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg hover:border-gray-700 transition-all flex flex-col page-break">
            
            {/* Image/Video Area */}
            <div className={`relative ${getAspectRatioClass(currentRatio)} bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-800`}>
              {panel.videoUrl ? (
                  <video 
                    src={panel.videoUrl} 
                    controls 
                    className="w-full h-full object-cover"
                    poster={panel.imageUrl}
                  />
              ) : panel.imageUrl ? (
                <>
                    <img 
                        src={panel.imageUrl} 
                        alt={panel.visualDescription} 
                        className="w-full h-full object-cover" 
                    />
                    
                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 no-print">
                        <button onClick={() => setActiveImage(panel.imageUrl || null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm text-white transition-colors" title="Expand">
                            <Maximize2 className="w-4 h-4" />
                        </button>
                        
                        <button onClick={() => {
                            setEditingPanelId(panel.id);
                            setEditPrompt(""); // Reset prompt for new edit
                        }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm text-white transition-colors" title="Edit with AI">
                            <Wand2 className="w-4 h-4" />
                        </button>
                        
                        {panel.isGeneratingVideo ? (
                             <div className="p-2 bg-white/10 rounded-full backdrop-blur-sm"><Loader2 className="w-4 h-4 animate-spin text-indigo-400" /></div>
                        ) : (
                            <button onClick={() => handleAnimatePanel(panel)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm text-white transition-colors" title="Animate (Veo)">
                                <Film className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </>
              ) : (
                panel.isGeneratingImage ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <span className="text-xs text-gray-500 font-medium tracking-wide">GENERATING</span>
                  </div>
                ) : (
                  <button 
                    onClick={() => handleGenerateImage(panel)}
                    className="flex flex-col items-center gap-2 text-gray-600 hover:text-indigo-400 transition-colors"
                  >
                    <ImageIcon className="w-10 h-10" />
                    <span className="text-xs font-medium">Generate Visual</span>
                  </button>
                )
              )}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] font-bold text-white border border-white/10 z-10 pointer-events-none">
                SCENE {panel.panelNumber}
              </div>
              {panel.shotType && (
                 <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-900/80 backdrop-blur-md rounded text-[10px] font-bold text-indigo-100 border border-indigo-500/30 z-10 pointer-events-none">
                    {panel.shotType}
                 </div>
              )}
            </div>

            {/* Content Area */}
            <div className="p-4 flex flex-col gap-3 flex-1 bg-gray-900">
              {editingPanelId === panel.id ? (
                  <div className="flex flex-col gap-2 no-print animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2 text-indigo-400">
                          <Wand2 className="w-3 h-3" />
                          <span className="text-[10px] font-bold uppercase">AI Edit</span>
                      </div>
                      <input 
                        type="text"
                        placeholder='e.g., "Add a retro filter", "Remove the chair"'
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingPanelId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                          <button 
                            disabled={!editPrompt.trim()}
                            onClick={() => handleEditImage(panel, editPrompt)} 
                            className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-500 disabled:opacity-50"
                          >
                              Apply Edit
                          </button>
                      </div>
                  </div>
              ) : (
                <>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                             <h4 className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Visual</h4>
                             {/* Small regenerate button for quick fixes without full edit mode */}
                             <button onClick={() => handleGenerateImage(panel)} className="text-gray-600 hover:text-indigo-400 no-print" title="Regenerate from scratch">
                                 <RefreshCcw className="w-3 h-3" />
                             </button>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed font-light">{panel.visualDescription}</p>
                    </div>

                    {panel.dialogue && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider">Dialogue</h4>
                                <button 
                                    disabled={panel.isPlayingAudio}
                                    onClick={() => handlePlayAudio(panel.id, panel.dialogue)}
                                    className="text-gray-500 hover:text-white disabled:opacity-50 transition-colors no-print"
                                >
                                    {panel.isPlayingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                                </button>
                            </div>
                            <p className="text-sm text-gray-200 italic leading-relaxed font-serif">"{panel.dialogue}"</p>
                        </div>
                    )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {activeImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 no-print" onClick={() => setActiveImage(null)}>
            <img src={activeImage} className="max-w-full max-h-full rounded-lg shadow-2xl" />
            <button className="absolute top-8 right-8 text-white/50 hover:text-white">Close</button>
        </div>
      )}
    </div>
  );
};
