import React, { useState, useRef, useEffect } from 'react';
import { Search, Send, ExternalLink, Bot, User } from 'lucide-react';
import { searchResearch } from '../services/geminiService';
import { ChatMessage } from '../types';

export const ResearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: query
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsLoading(true);

    try {
      const result = await searchResearch(userMsg.text);
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: result.text,
        groundingSources: result.sources
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I couldn't perform that search right now."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800 w-full md:w-96 shadow-xl">
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <h3 className="font-semibold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" />
            Research Assistant
        </h3>
        <p className="text-xs text-gray-400 mt-1">Powered by Google Search Grounding</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
                <p>Ask about historical details, locations, or visual references.</p>
                <p className="text-xs mt-2">"What does 1950s diner lighting look like?"</p>
            </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`flex items-start gap-2 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                   {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
               </div>
               <div className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/30' : 'bg-gray-800 text-gray-200 border border-gray-700'}`}>
                  {msg.text}
               </div>
            </div>
            
            {/* Grounding Sources */}
            {msg.groundingSources && msg.groundingSources.length > 0 && (
              <div className="mt-2 ml-10 p-2 bg-gray-950/50 rounded text-xs space-y-1 border border-gray-800 w-[85%]">
                <span className="font-semibold text-gray-500 block mb-1">Sources:</span>
                {msg.groundingSources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 truncate transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
            <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center animate-pulse">
                     <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                    <span className="typing-dot">.</span><span className="typing-dot">.</span><span className="typing-dot">.</span>
                </div>
            </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-800 bg-gray-900/50">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Research topic..."
            className="w-full bg-gray-950 text-white rounded-lg pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-800 placeholder-gray-600"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
