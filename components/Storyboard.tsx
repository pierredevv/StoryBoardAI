import React, { useState, useEffect } from 'react';
import { StoryPanel, VisualStyle, AspectRatio, CharacterProfile, ImageResolution, TransitionType } from '../types';
import { generatePanelImage, generateSpeech, editPanelImage, generateVideoFromImage, generateAnimatic, outpaintPanelImage, OutpaintDirection } from '../services/geminiService';
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
    Wand2,
    ArrowRight,
    Clapperboard,
    X,
    Users,
    ArrowLeft,
    ArrowUp,
    ArrowDown,
    ZoomOut,
    Brush,
    Move,
    Undo2,
    Redo2,
    Save
} from 'lucide-react';

interface StoryboardProps {
  panels: StoryPanel[];
  setPanels: React.Dispatch<React.SetStateAction<StoryPanel[]>>;
  currentStyle: VisualStyle;
  currentRatio: AspectRatio;
  currentResolution: ImageResolution | null; // Null means "Standard" (Flash)
  characters: CharacterProfile[];
  setCharacters: React.Dispatch<React.SetStateAction<CharacterProfile[]>>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onApiKeyError: () => void;
}

type EditMode = 'modify' | 'expand';

export const Storyboard: React.FC<StoryboardProps> = ({ 
    panels, 
    setPanels, 
    currentStyle, 
    currentRatio, 
    currentResolution,
    characters,
    setCharacters,
    undo,
    redo,
    canUndo,
    canRedo,
    onApiKeyError
}) => {
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editMode, setEditMode] = useState<EditMode>('modify');
  
  // Character Editing State
  const [editingCharIndex, setEditingCharIndex] = useState<number | null>(null);
  const [tempCharDesc, setTempCharDesc] = useState("");

  // Animatic State
  const [isGeneratingAnimatic, setIsGeneratingAnimatic] = useState(false);
  const [animaticUrl, setAnimaticUrl] = useState<string | null>(null);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                if (canRedo) redo();
            } else {
                if (canUndo) undo();
            }
        }
        // Some browsers use Ctrl+Y for Redo
        if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
            e.preventDefault();
            if (canRedo) redo();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

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
      } : p));
      
      setEditingPanelId(null);
  };

  const handleOutpaintImage = async (panel: StoryPanel, direction: OutpaintDirection) => {
      if (!panel.imageUrl) return;

      setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingImage: true } : p));
      setEditingPanelId(null); // Close the edit UI while generating

      const imageUrl = await outpaintPanelImage(panel.imageUrl, direction);
      
      setPanels(prev => prev.map(p => p.id === panel.id ? { 
          ...p, 
          imageUrl: imageUrl || undefined, 
          isGeneratingImage: false,
      } : p));
  };

  const handleAnimatePanel = async (panel: StoryPanel) => {
      if (!panel.imageUrl) return;

      setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingVideo: true } : p));
      
      try {
        const videoUrl = await generateVideoFromImage(panel.imageUrl, currentRatio);
        setPanels(prev => prev.map(p => p.id === panel.id ? { 
            ...p, 
            videoUrl: videoUrl || undefined, 
            isGeneratingVideo: false
        } : p));
      } catch (e: any) {
        if (e.message && e.message.includes("Requested entity was not found")) {
            onApiKeyError();
        } else {
            alert("Video generation failed. Please try again.");
        }
        setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, isGeneratingVideo: false } : p));
      }
  };

  const handleGenerateAnimatic = async () => {
    // Basic check for generated images
    const readyPanels = panels.filter(p => p.imageUrl);
    if (readyPanels.length < 2) {
        alert("Please generate images for at least 2 panels to create an animatic sequence.");
        return;
    }
    
    setIsGeneratingAnimatic(true);
    setAnimaticUrl(null);

    try {
        // Call service with characters
        const url = await generateAnimatic(panels, characters);
        
        if (url) {
            setAnimaticUrl(url);
        } else {
            alert("Failed to generate animatic. Veo sequences take time and resources.");
        }
    } catch (e: any) {
        if (e.message && e.message.includes("Requested entity was not found")) {
            onApiKeyError();
        } else {
            console.error(e);
            alert("Animatic generation failed.");
        }
    } finally {
        setIsGeneratingAnimatic(false);
    }
  };

  const handleDownloadAnimatic = async () => {
     if (!animaticUrl) return;
     try {
         const response = await fetch(animaticUrl);
         const blob = await response.blob();
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `storyforge-animatic-${Date.now()}.mp4`;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         window.URL.revokeObjectURL(url);
     } catch (e) {
         console.error("Download failed", e);
         // Fallback for CORS issues
         window.open(animaticUrl, '_blank');
     }
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

  const handleTransitionChange = (panelId: string, transition: TransitionType) => {
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, transition } : p));
  };

  const saveCharacterEdit = (idx: number) => {
      const newChars = [...characters];
      newChars[idx].description = tempCharDesc;
      setCharacters(newChars);
      setEditingCharIndex(null);
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
             <div className="flex bg-gray-800 rounded-lg p-1 mr-2 border border-gray-700">
                <button 
                    onClick={undo} 
                    disabled={!canUndo}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 className="w-4 h-4" />
                </button>
                <button 
                    onClick={redo} 
                    disabled={!canRedo}
                    className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <Redo2 className="w-4 h-4" />
                </button>
            </div>

            <button 
                onClick={handlePrint}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-all flex items-center gap-2 border border-gray-700"
            >
                <Printer className="w-4 h-4" />
                Export PDF
            </button>
            <button 
                onClick={handleGenerateAnimatic}
                disabled={isGeneratingAnimatic}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-medium transition-all flex items-center gap-2 border border-pink-500 disabled:opacity-50"
            >
                {isGeneratingAnimatic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                Animatic
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

      {/* Character Summary Section */}
      {characters.length > 0 && (
        <div className="mb-8 p-4 bg-gray-900/50 rounded-xl border border-gray-800/50 backdrop-blur-sm no-print animate-in fade-in slide-in-from-top-4 duration-500">
             <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Cast Visual Profile</h3>
                <span className="text-xs text-gray-500 ml-auto hidden sm:inline">Click descriptions to edit and fix consistency</span>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {characters.map((char, idx) => (
                    <div key={idx} className="bg-gray-950 border border-gray-800 rounded-lg p-3 hover:border-indigo-500/30 transition-all group relative">
                        <div className="font-bold text-indigo-200 text-sm mb-1 group-hover:text-indigo-300 transition-colors flex justify-between">
                            {char.name}
                            {editingCharIndex !== idx && (
                                <Edit3 className="w-3 h-3 text-gray-600 group-hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </div>
                        
                        {editingCharIndex === idx ? (
                             <div className="relative">
                                 <textarea
                                    value={tempCharDesc}
                                    onChange={(e) => setTempCharDesc(e.target.value)}
                                    className="w-full bg-gray-900 text-xs text-gray-200 p-2 rounded border border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-24 resize-none"
                                    autoFocus
                                 />
                                 <div className="flex justify-end gap-1 mt-1">
                                     <button 
                                        onClick={() => setEditingCharIndex(null)}
                                        className="p-1 text-gray-400 hover:text-white"
                                     >
                                         <X className="w-3 h-3" />
                                     </button>
                                     <button 
                                        onClick={() => saveCharacterEdit(idx)}
                                        className="p-1 text-indigo-400 hover:text-indigo-300"
                                     >
                                         <Save className="w-3 h-3" />
                                     </button>
                                 </div>
                             </div>
                        ) : (
                            <div 
                                onClick={() => {
                                    setTempCharDesc(char.description);
                                    setEditingCharIndex(idx);
                                }}
                                className="text-xs text-gray-500 leading-snug line-clamp-3 group-hover:text-gray-400 cursor-pointer hover:bg-gray-900/50 rounded p-1 -m-1" 
                                title="Click to edit character visual description"
                            >
                                {char.description}
                            </div>
                        )}
                    </div>
                ))}
             </div>
        </div>
      )}

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
                            setEditMode('modify');
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
                      
                      {/* Edit Mode Tabs */}
                      <div className="flex items-center gap-2 mb-2 bg-gray-950 p-1 rounded-lg border border-gray-800">
                         <button 
                            onClick={() => setEditMode('modify')}
                            className={`flex-1 text-[10px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors ${editMode === 'modify' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                            <Brush className="w-3 h-3" /> Modify
                         </button>
                         <button 
                            onClick={() => setEditMode('expand')}
                            className={`flex-1 text-[10px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 transition-colors ${editMode === 'expand' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                         >
                            <Move className="w-3 h-3" /> Expand
                         </button>
                      </div>

                      {editMode === 'modify' ? (
                        <>
                            <div className="flex items-center gap-2 text-indigo-400 mb-1">
                                <Wand2 className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Inpaint / Replace</span>
                            </div>
                            <input 
                                type="text"
                                placeholder='e.g., "Replace the car with a bike"'
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                                autoFocus
                            />
                            <div className="flex gap-2 justify-end mt-1">
                                <button onClick={() => setEditingPanelId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                                <button 
                                    disabled={!editPrompt.trim()}
                                    onClick={() => handleEditImage(panel, editPrompt)} 
                                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-500 disabled:opacity-50"
                                >
                                    Apply Edit
                                </button>
                            </div>
                        </>
                      ) : (
                        <>
                            <div className="flex items-center gap-2 text-indigo-400 mb-1">
                                <Move className="w-3 h-3" />
                                <span className="text-[10px] font-bold uppercase">Outpaint Direction</span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 mt-1">
                                {/* Top Row */}
                                <div className="col-start-2">
                                     <button 
                                        onClick={() => handleOutpaintImage(panel, 'up')}
                                        className="w-full p-2 bg-gray-950 border border-gray-700 rounded hover:bg-gray-800 hover:border-gray-600 flex justify-center text-gray-300"
                                        title="Expand Up"
                                     >
                                         <ArrowUp className="w-4 h-4" />
                                     </button>
                                </div>
                                
                                {/* Middle Row */}
                                <div className="col-start-1 row-start-2">
                                     <button 
                                        onClick={() => handleOutpaintImage(panel, 'left')}
                                        className="w-full p-2 bg-gray-950 border border-gray-700 rounded hover:bg-gray-800 hover:border-gray-600 flex justify-center text-gray-300"
                                        title="Expand Left"
                                     >
                                         <ArrowLeft className="w-4 h-4" />
                                     </button>
                                </div>
                                <div className="col-start-2 row-start-2">
                                     <button 
                                        onClick={() => handleOutpaintImage(panel, 'zoom-out')}
                                        className="w-full p-2 bg-gray-950 border border-gray-700 rounded hover:bg-gray-800 hover:border-gray-600 flex justify-center text-indigo-400"
                                        title="Zoom Out (Expand All Sides)"
                                     >
                                         <ZoomOut className="w-4 h-4" />
                                     </button>
                                </div>
                                <div className="col-start-3 row-start-2">
                                     <button 
                                        onClick={() => handleOutpaintImage(panel, 'right')}
                                        className="w-full p-2 bg-gray-950 border border-gray-700 rounded hover:bg-gray-800 hover:border-gray-600 flex justify-center text-gray-300"
                                        title="Expand Right"
                                     >
                                         <ArrowRight className="w-4 h-4" />
                                     </button>
                                </div>
                                
                                {/* Bottom Row */}
                                <div className="col-start-2 row-start-3">
                                     <button 
                                        onClick={() => handleOutpaintImage(panel, 'down')}
                                        className="w-full p-2 bg-gray-950 border border-gray-700 rounded hover:bg-gray-800 hover:border-gray-600 flex justify-center text-gray-300"
                                        title="Expand Down"
                                     >
                                         <ArrowDown className="w-4 h-4" />
                                     </button>
                                </div>
                            </div>
                            <div className="flex justify-end mt-2">
                                <button onClick={() => setEditingPanelId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                            </div>
                        </>
                      )}
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

                    {/* Transition Selector */}
                    <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between no-print">
                        <div className="flex items-center gap-1.5 text-gray-500">
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Transition</span>
                        </div>
                        <select
                            value={panel.transition || TransitionType.NONE}
                            onChange={(e) => handleTransitionChange(panel.id, e.target.value as TransitionType)}
                            className="bg-gray-950 border border-gray-700 text-gray-400 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-indigo-500 hover:border-gray-600 transition-colors cursor-pointer"
                        >
                            {Object.values(TransitionType).map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox for Image */}
      {activeImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 no-print" onClick={() => setActiveImage(null)}>
            <img src={activeImage} className="max-w-full max-h-full rounded-lg shadow-2xl" />
            <button className="absolute top-8 right-8 text-white/50 hover:text-white">Close</button>
        </div>
      )}

      {/* Lightbox for Animatic */}
      {animaticUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 no-print" onClick={() => setAnimaticUrl(null)}>
             <div className="relative w-full max-w-5xl bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <h3 className="text-white text-xl font-bold flex items-center gap-2">
                        <Clapperboard className="w-6 h-6 text-pink-500" />
                        Generated Animatic
                    </h3>
                    <button onClick={() => setAnimaticUrl(null)} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="bg-black aspect-video w-full flex items-center justify-center">
                    <video 
                        src={animaticUrl} 
                        controls 
                        autoPlay
                        className="w-full h-full object-contain"
                    />
                </div>
                
                <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-gray-950 gap-4">
                    <p className="text-xs text-gray-500">
                        * Animatic created by Veo using the first 3 generated panels as reference frames.
                    </p>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setAnimaticUrl(null)}
                            className="px-4 py-2 text-gray-400 hover:text-white font-medium transition-colors"
                        >
                            Close
                        </button>
                        <button 
                            onClick={handleDownloadAnimatic}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            <Download className="w-4 h-4" />
                            Download MP4
                        </button>
                    </div>
                </div>
             </div>
        </div>
      )}
    </div>
  );
};