import React, { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeScript } from './services/geminiService';
import { parseFile } from './services/fileService';
import { StoryPanel, AppMode, VisualStyle, AspectRatio, CharacterProfile, ImageResolution } from './types';
import { Storyboard } from './components/Storyboard';
import { LiveAssistant } from './components/LiveAssistant';
import { ResearchPanel } from './components/ResearchPanel';
import { LayoutDashboard, Mic, BookOpen, Wand2, Loader2, Sparkles, Settings2, Users, AlertCircle, Key, Upload, FileText } from 'lucide-react';

// Custom Hook for Undo/Redo History
function useHistory<T>(initialState: T) {
  const [state, _setState] = useState<T>(initialState);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const setState = useCallback((newState: T | ((prev: T) => T)) => {
    _setState((currentState) => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prev: T) => T)(currentState) 
        : newState;
      
      setPast((prevPast) => [...prevPast, currentState]);
      setFuture([]); // Clear future on new change
      return nextState;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;

      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, -1);

      _setState((currentState) => {
        setFuture((prevFuture) => [currentState, ...prevFuture]);
        return previous;
      });

      return newPast;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;

      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      _setState((currentState) => {
        setPast((prevPast) => [...prevPast, currentState]);
        return next;
      });

      return newFuture;
    });
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    resetHistory: () => { setPast([]); setFuture([]); }
  };
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppMode>(AppMode.STORYBOARD);
  const [script, setScript] = useState('');
  
  // App State with History
  const { 
    state: panels, 
    setState: setPanels, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    resetHistory 
  } = useHistory<StoryPanel[]>([]);

  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>(VisualStyle.CINEMATIC);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  
  // Resolution controls enabling "Pro" model
  const [resolution, setResolution] = useState<ImageResolution | null>(null); // Null = Standard (Flash)
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  
  // API Key Selection State
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for dev environments without the wrapper, assume env var is there
        setHasApiKey(true); 
      }
      setIsCheckingKey(false);
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success after dialog interaction, or re-check
      setHasApiKey(hasKey => true);
    }
  };

  const handleAnalyze = async () => {
    if (!script.trim()) return;
    setIsAnalyzing(true);
    const result = await analyzeScript(script);
    
    // When generating a fresh script, we usually want to reset the undo stack
    // so the user doesn't undo back into an empty state or the previous script abruptly.
    setPanels(result.panels); 
    resetHistory(); 
    
    setCharacters(result.characters);
    setIsAnalyzing(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const extractedText = await parseFile(file);
      setScript(extractedText);
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import file. Please ensure it is a valid .txt, .pdf, or .fdx file.");
    } finally {
      setIsImporting(false);
      // Reset input value to allow re-uploading same file if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isCheckingKey) {
    return <div className="h-screen w-full bg-gray-950 flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  // Mandatory Key Selection Screen
  if (!hasApiKey) {
    return (
      <div className="h-screen w-full bg-gray-950 flex flex-col items-center justify-center text-white p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-900/50">
             <Key className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Connect AI Studio</h1>
          <p className="text-gray-400">To use high-fidelity image generation and Veo video features, you must select a paid API key from your Google Cloud project.</p>
          
          <button 
            onClick={handleSelectKey}
            className="w-full py-3 bg-white text-gray-950 font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            Select API Key
          </button>
          
          <p className="text-xs text-gray-600">
            Learn more about <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline hover:text-gray-400">Gemini API billing</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-gray-950 text-white font-sans selection:bg-indigo-500/30">
      
      {/* Sidebar Navigation */}
      <div className="w-20 lg:w-64 border-r border-gray-800 flex flex-col justify-between shrink-0 bg-gray-950/50 backdrop-blur-sm z-20">
        <div>
            <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-gray-800">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-500/50 shadow-lg">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="hidden lg:block ml-3 font-bold text-lg tracking-tight">StoryForge</span>
            </div>

            <nav className="p-4 space-y-2">
                <button 
                    onClick={() => setActiveTab(AppMode.STORYBOARD)}
                    className={`w-full flex items-center p-3 rounded-xl transition-all ${activeTab === AppMode.STORYBOARD ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
                >
                    <LayoutDashboard className="w-5 h-5" />
                    <span className="hidden lg:block ml-3 font-medium">Storyboard</span>
                </button>
                <button 
                    onClick={() => setActiveTab(AppMode.LIVE_DIRECTOR)}
                    className={`w-full flex items-center p-3 rounded-xl transition-all ${activeTab === AppMode.LIVE_DIRECTOR ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
                >
                    <Mic className="w-5 h-5" />
                    <span className="hidden lg:block ml-3 font-medium">Live Director</span>
                </button>
            </nav>
            
            {/* Character List Summary (Visible if characters exist) */}
            {characters.length > 0 && (
                <div className="px-6 py-4 hidden lg:block">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Users className="w-3 h-3" /> Cast
                    </h3>
                    <div className="space-y-3">
                        {characters.map((char, idx) => (
                            <div key={idx} className="text-xs">
                                <span className="font-bold text-indigo-300 block">{char.name}</span>
                                <span className="text-gray-500 line-clamp-2">{char.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-gray-800">
             <button 
                onClick={() => setShowResearch(!showResearch)}
                className={`w-full flex items-center justify-center lg:justify-start p-3 rounded-xl border transition-all ${showResearch ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 'border-gray-800 text-gray-500 hover:bg-gray-900'}`}
             >
                <BookOpen className="w-5 h-5" />
                <span className="hidden lg:block ml-3 font-medium text-sm">Research Tool</span>
             </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Input Bar & Settings */}
        {activeTab === AppMode.STORYBOARD && (
            <div className="border-b border-gray-800 bg-gray-900 flex flex-col z-10 shrink-0">
                
                {/* Script Input Row */}
                <div className="flex items-start p-4 gap-4">
                    <div className="flex-1 relative">
                        <textarea
                            value={script}
                            onChange={(e) => setScript(e.target.value)}
                            placeholder="Paste your movie script here, or import a file (PDF, FDX)..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-16 lg:h-12 lg:min-h-[3rem] transition-all pr-12"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute right-3 top-3 text-gray-500 hover:text-indigo-400 transition-colors p-1"
                            title="Import Script (.pdf, .fdx, .txt)"
                        >
                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".txt,.pdf,.fdx"
                            className="hidden"
                        />
                    </div>
                    <button 
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !script.trim()}
                        className="h-12 px-6 bg-white text-gray-950 font-bold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shrink-0"
                    >
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        <span className="hidden sm:inline">Analyze Script</span>
                    </button>
                </div>

                {/* Cinematic Toolbar */}
                <div className="flex items-center px-4 py-2 bg-gray-950/50 border-t border-gray-800 gap-6 overflow-x-auto">
                    <div className="flex items-center gap-2 shrink-0">
                        <Settings2 className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Settings</span>
                    </div>

                    <div className="h-4 w-px bg-gray-800 shrink-0"></div>

                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs text-gray-400">Style</label>
                        <select 
                            value={visualStyle}
                            onChange={(e) => setVisualStyle(e.target.value as VisualStyle)}
                            className="bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                        >
                            {Object.values(VisualStyle).map(style => (
                                <option key={style} value={style}>{style}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-xs text-gray-400">Ratio</label>
                        <select 
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                            className="bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="16:9">16:9 (Cinema)</option>
                            <option value="9:16">9:16 (Social)</option>
                            <option value="4:3">4:3 (TV)</option>
                            <option value="1:1">1:1 (Square)</option>
                        </select>
                    </div>

                    <div className="h-4 w-px bg-gray-800 shrink-0"></div>

                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-indigo-400">Pro Mode</span>
                        <select 
                            value={resolution || "Standard"}
                            onChange={(e) => setResolution(e.target.value === "Standard" ? null : e.target.value as ImageResolution)}
                            className="bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="Standard">Standard (Flash)</option>
                            <option value="1K">1K (Pro)</option>
                            <option value="2K">2K (Pro)</option>
                            <option value="4K">4K (Pro)</option>
                        </select>
                    </div>
                </div>
            </div>
        )}

        {/* Viewport */}
        <div className="flex-1 overflow-hidden relative bg-gray-950">
            {activeTab === AppMode.STORYBOARD && (
                <Storyboard 
                    panels={panels} 
                    setPanels={setPanels} 
                    currentStyle={visualStyle}
                    currentRatio={aspectRatio}
                    currentResolution={resolution}
                    characters={characters}
                    undo={undo}
                    redo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            )}
            
            {activeTab === AppMode.LIVE_DIRECTOR && (
                <div className="h-full w-full p-6">
                    <LiveAssistant />
                </div>
            )}
        </div>
      </div>

      {/* Research Sidebar (Collapsible) */}
      <div className={`transition-all duration-300 ease-in-out border-l border-gray-800 bg-gray-900 overflow-hidden ${showResearch ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0'}`}>
         <div className="h-full w-80">
            <ResearchPanel />
         </div>
      </div>

    </div>
  );
};

export default App;