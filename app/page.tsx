"use client";

import { useState } from "react";

interface Track {
  id: string;
  name: string;
  artist: string;
  url: string;
  imageUrl?: string;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep track of the current playing song metadata in the footer player bar
  const [currentTrack, setCurrentTrack] = useState<Partial<Track>>({
    name: "Analog Dreams",
    artist: "Crate Master Vol. 4",
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBjQd6U4epCLv3_s0NIkd3IJ-5dVyvCENZz8UUF3xz-JLVLXsdPCEJJJcb4GMbxDDSj-2nJEHJPCasCpMtRObDp9s4QPnfg9vGYEfg34BEJBDOEc-4obJjKZK1gMuBpuXafncsr-pl4sixNABwn7DAx94ua8xEpEHLA-MwLoOGDAm-45Fj0TC8E4fNg2LPB5LuDPSXZXCTr1-LuBkxWIXmSn2eEX6QBzCiLp_lZ2vt9t9MDCVGoC842HItdTlFYTFdCyqwhXoBpOqv2"
  });

  const handleCurate = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setWarning(false);

    try {
      const res = await fetch("/api/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to curate vibe");
      }

      const data = await res.json();
      setResults(data.tracks || []);
      setWarning(data.warning || false);

      // Automatically load first track in the player bar if tracks returned
      if (data.tracks && data.tracks.length > 0) {
        setCurrentTrack(data.tracks[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setPrompt("");
    setResults([]);
    setWarning(false);
    setError(null);
  };

  const handleSelectTrack = (track: Track) => {
    setCurrentTrack(track);
  };

  return (
    <div className="flex flex-1 overflow-hidden p-2 gap-2">
      {/* Spotify Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] gap-2 shrink-0">
        {/* Top Nav */}
        <div className="bg-surface rounded-lg p-4 flex flex-col gap-4">
          <a className="flex items-center gap-5 px-2 spotify-sidebar-item active" href="#">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
            <span className="font-bold text-sm">Home</span>
          </a>
          <a className="flex items-center gap-5 px-2 spotify-sidebar-item" href="#">
            <span className="material-symbols-outlined text-2xl">search</span>
            <span className="font-bold text-sm">Search</span>
          </a>
        </div>
        {/* Library Section */}
        <div className="bg-surface rounded-lg flex-1 flex flex-col overflow-hidden">
          <div className="p-4 flex items-center justify-between shadow-lg z-10">
            <button className="flex items-center gap-3 spotify-sidebar-item">
              <span className="material-symbols-outlined text-2xl">library_music</span>
              <span className="font-bold text-sm">Your Library</span>
            </button>
            <div className="flex gap-2">
              <button className="p-1 spotify-sidebar-item"><span className="material-symbols-outlined">add</span></button>
              <button className="p-1 spotify-sidebar-item"><span className="material-symbols-outlined">arrow_forward</span></button>
            </div>
          </div>
          {/* Library Tags */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-hidden">
            <span className="bg-[#2a2a2a] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#3e3e3e] transition-colors">Playlists</span>
            <span className="bg-[#2a2a2a] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#3e3e3e] transition-colors">Artists</span>
            <span className="bg-[#2a2a2a] px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:bg-[#3e3e3e] transition-colors">Albums</span>
          </div>
          {/* Library List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer">
              <div className="w-12 h-12 bg-primary rounded flex items-center justify-center">
                <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Liked Songs</span>
                <span className="text-xs text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>keep</span>
                  Playlist • 1,245 songs
                </span>
              </div>
            </div>
            {/* Crate Digger Item */}
            <div className="flex items-center gap-3 p-2 rounded-md bg-white/10 cursor-pointer">
              <div className="w-12 h-12 bg-[#1db954]/20 rounded flex items-center justify-center">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>album</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Crate Digger AI</span>
                <span className="text-xs text-on-surface-variant">Feature • Curate Vibe</span>
              </div>
            </div>
            {/* Dummy Items */}
            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer opacity-70">
              <img className="w-12 h-12 rounded object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFqg3Lmx2d40nxulFeqoAZx5YxxVJPraayqWajoMK1Yas8ReIzTug-BxIlvsBeToZgP5zmHf7DxsLXpzCqD0caLBQoNC5yBLbPRrm-eL6VT6T4p4oJpt6BFCZPTqT7_1L1eJciMQw6GIumKWiHyOCLqHU-1VvAz310unx_Xl5bVBUN-L5t3gHrbnVlGC6ISXDYOkGIur2-KL-1PDRWPn3bW1A0n2kyeEzMSsnMT9I0tAmgMN2t8A1mMgdNW-Qj6XNKyRx6udtzgw1-"/>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white">Midnight City</span>
                <span className="text-xs text-on-surface-variant">Album • M83</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-surface rounded-lg overflow-y-auto custom-scrollbar relative flex flex-col">
        {/* Top Sticky Header */}
        <header className="sticky top-0 h-16 px-6 flex items-center justify-between z-20 bg-[#121212]/80 backdrop-blur-md">
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"><span className="material-symbols-outlined text-white">chevron_left</span></button>
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center opacity-50"><span className="material-symbols-outlined text-white">chevron_right</span></button>
          </div>
          <div className="flex items-center gap-4">
            <button className="bg-white text-black px-4 py-1.5 rounded-full text-sm font-bold hover:scale-105 transition-transform">Explore Premium</button>
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"><span className="material-symbols-outlined text-white text-[20px]">notifications</span></button>
            <button className="w-8 h-8 rounded-full bg-black/40 p-1 flex items-center justify-center hover:bg-black/60 transition-colors">
              <div className="w-full h-full rounded-full bg-zinc-600"></div>
            </button>
          </div>
        </header>

        {/* Crate Digger Hero Section */}
        <section className="vibe-hero px-6 pt-2 pb-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>album</span>
            <h1 className="text-3xl font-extrabold tracking-tight">Crate Digger AI</h1>
          </div>
          <div className="max-w-3xl">
            <h2 className="text-5xl font-black mb-6">What's the vibe?</h2>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                className="w-full min-h-[140px] bg-[#2a2a2a] border-none rounded-lg p-6 text-lg focus:ring-0 placeholder:text-zinc-500 resize-none mb-4 focus:outline-none"
                placeholder="Describe the mood, instruments, or energy you're looking for... (e.g., 'Late night driving through a neon city')"
              ></textarea>
              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClear}
                  disabled={isLoading}
                  className="bg-transparent hover:bg-white/10 text-white font-bold px-6 py-3 rounded-full transition-all text-sm uppercase tracking-wider disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  onClick={handleCurate}
                  disabled={isLoading || !prompt.trim()}
                  className="bg-primary hover:bg-[#1ed760] disabled:bg-primary/50 text-black font-bold px-8 py-3 rounded-full transition-all text-sm uppercase tracking-wider shadow-xl flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      Curating...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                      Curate My Vibe
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Results Grid / Loaders */}
          <div className="mt-8 flex-1 min-h-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold">Curated for your vibe</h3>
              {results.length > 0 && (
                <button className="text-on-surface-variant hover:text-white text-sm font-bold transition-colors">Show all</button>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-3">
                <span className="material-symbols-outlined text-red-500">error</span>
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Warning Message (Fallback triggered) */}
            {warning && (
              <div className="bg-[#e9b308]/10 border border-[#e9b308]/30 text-[#fde047] p-4 rounded-lg mb-6 flex items-center gap-3">
                <span className="material-symbols-outlined text-[#e9b308]">warning</span>
                <p className="text-sm font-medium">Over-filtering fallback triggered: returned top tracks directly as all matching options were excluded by search parameters.</p>
              </div>
            )}

            {/* Case 1: Loading state */}
            {isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {/* Skeletion Loaders */}
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="spotify-card p-4 rounded-lg animate-pulse">
                    <div className="aspect-square bg-zinc-800 rounded-md mb-4"></div>
                    <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-zinc-800 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Case 2: Curated tracks returned */}
            {!isLoading && results.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-28">
                {results.map((track) => (
                  <div 
                    key={track.id} 
                    className="bg-[#181818] p-2 rounded-lg border border-zinc-900 shadow-2xl hover:bg-[#282828] transition-all group relative flex flex-col justify-between"
                  >
                    <div className="relative mb-2">
                      <iframe
                        src={`https://open.spotify.com/embed/track/${track.id}`}
                        width="100%"
                        height="152"
                        frameBorder="0"
                        allowFullScreen
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                        className="rounded-md"
                      ></iframe>
                    </div>
                    <div className="flex justify-between items-center p-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <h4 className="font-bold text-sm text-white truncate">{track.name}</h4>
                        <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
                      </div>
                      <button 
                        onClick={() => handleSelectTrack(track)}
                        className="w-10 h-10 bg-primary text-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:scale-105 transition-all shadow-xl"
                      >
                        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Case 3: Initial idle state (no results, not loading) - Show default placeholder cards */}
            {!isLoading && results.length === 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-28">
                {/* Result Card 1 */}
                <div 
                  className="spotify-card p-4 rounded-lg group cursor-pointer relative"
                  onClick={() => handleSelectTrack({
                    id: "analog-dreams-mock",
                    name: "Analog Dreams",
                    artist: "Synth Master",
                    url: "",
                    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBjQd6U4epCLv3_s0NIkd3IJ-5dVyvCENZz8UUF3xz-JLVLXsdPCEJJJcb4GMbxDDSj-2nJEHJPCasCpMtRObDp9s4QPnfg9vGYEfg34BEJBDOEc-4obJjKZK1gMuBpuXafncsr-pl4sixNABwn7DAx94ua8xEpEHLA-MwLoOGDAm-45Fj0TC8E4fNg2LPB5LuDPSXZXCTr1-LuBkxWIXmSn2eEX6QBzCiLp_lZ2vt9t9MDCVGoC842HItdTlFYTFdCyqwhXoBpOqv2"
                  })}
                >
                  <div className="relative mb-4">
                    <div className="aspect-square bg-zinc-800 rounded-md shadow-2xl overflow-hidden">
                      <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBjQd6U4epCLv3_s0NIkd3IJ-5dVyvCENZz8UUF3xz-JLVLXsdPCEJJJcb4GMbxDDSj-2nJEHJPCasCpMtRObDp9s4QPnfg9vGYEfg34BEJBDOEc-4obJjKZK1gMuBpuXafncsr-pl4sixNABwn7DAx94ua8xEpEHLA-MwLoOGDAm-45Fj0TC8E4fNg2LPB5LuDPSXZXCTr1-LuBkxWIXmSn2eEX6QBzCiLp_lZ2vt9t9MDCVGoC842HItdTlFYTFdCyqwhXoBpOqv2"/>
                    </div>
                    <button className="absolute bottom-2 right-2 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl play-button-hover text-black">
                      <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-sm truncate mb-1">Analog Dreams</h4>
                  <p className="text-xs text-on-surface-variant line-clamp-2">Synth-heavy, dreamy textures for your night drives.</p>
                </div>

                {/* Result Card 2 */}
                <div 
                  className="spotify-card p-4 rounded-lg group cursor-pointer relative"
                  onClick={() => handleSelectTrack({
                    id: "neon-pulse-mock",
                    name: "Neon Pulse",
                    artist: "Future Beat",
                    url: "",
                    imageUrl: ""
                  })}
                >
                  <div className="relative mb-4">
                    <div className="aspect-square bg-zinc-800 rounded-md shadow-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-zinc-700">music_note</span>
                    </div>
                    <button className="absolute bottom-2 right-2 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl play-button-hover text-black">
                      <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-sm truncate mb-1">Neon Pulse</h4>
                  <p className="text-xs text-on-surface-variant line-clamp-2">High energy electronic pulses with a retro futuristic feel.</p>
                </div>

                {/* Result Card 3 */}
                <div 
                  className="spotify-card p-4 rounded-lg group cursor-pointer relative"
                  onClick={() => handleSelectTrack({
                    id: "lofi-cityscape-mock",
                    name: "Low-Fi Cityscape",
                    artist: "Beatmaker",
                    url: "",
                    imageUrl: ""
                  })}
                >
                  <div className="relative mb-4">
                    <div className="aspect-square bg-zinc-800 rounded-md shadow-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-zinc-700">graphic_eq</span>
                    </div>
                    <button className="absolute bottom-2 right-2 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl play-button-hover text-black">
                      <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </button>
                  </div>
                  <h4 className="font-bold text-sm truncate mb-1">Low-Fi Cityscape</h4>
                  <p className="text-xs text-on-surface-variant line-clamp-2">Relaxing beats and atmospheric background noise.</p>
                </div>

                {/* Result Card 4 (Skeleton style) */}
                <div className="spotify-card p-4 rounded-lg group cursor-pointer relative animate-pulse">
                  <div className="relative mb-4">
                    <div className="aspect-square bg-zinc-800 rounded-md shadow-2xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-zinc-700">insights</span>
                    </div>
                  </div>
                  <h4 className="font-bold text-sm truncate mb-1 text-zinc-600">Curating...</h4>
                  <p className="text-xs text-zinc-700 line-clamp-2">Discover new suggestions tailored dynamically to your prompt.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Spotify Player Bar */}
      <footer className="h-[90px] bg-black px-4 flex items-center justify-between z-50 fixed bottom-0 left-0 right-0 border-t border-zinc-900">
        {/* Current Track */}
        <div className="flex items-center gap-4 w-[30%]">
          <div className="w-14 h-14 rounded overflow-hidden shadow-lg group relative cursor-pointer flex-shrink-0 bg-zinc-800 flex items-center justify-center">
            {currentTrack.imageUrl ? (
              <img className="w-full h-full object-cover" src={currentTrack.imageUrl} alt={currentTrack.name}/>
            ) : (
              <span className="material-symbols-outlined text-zinc-400 text-3xl">music_note</span>
            )}
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-white text-sm bg-black/60 rounded-full">expand_less</span>
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            {currentTrack.url ? (
              <a className="text-sm font-medium hover:underline truncate" href={currentTrack.url} target="_blank" rel="noopener noreferrer">
                {currentTrack.name}
              </a>
            ) : (
              <span className="text-sm font-medium truncate">{currentTrack.name}</span>
            )}
            <span className="text-[11px] text-on-surface-variant truncate">{currentTrack.artist}</span>
          </div>
          <button className="text-on-surface-variant hover:text-primary transition-colors ml-2">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
          </button>
        </div>

        {/* Player Controls */}
        <div className="flex flex-col items-center gap-2 max-w-[40%] w-full">
          <div className="flex items-center gap-6">
            <button className="text-on-surface-variant hover:text-white transition-colors"><span className="material-symbols-outlined text-xl">shuffle</span></button>
            <button className="text-on-surface-variant hover:text-white transition-colors"><span className="material-symbols-outlined text-3xl">skip_previous</span></button>
            <button className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </button>
            <button className="text-on-surface-variant hover:text-white transition-colors"><span className="material-symbols-outlined text-3xl">skip_next</span></button>
            <button className="text-on-surface-variant hover:text-white transition-colors"><span className="material-symbols-outlined text-xl">repeat</span></button>
          </div>
          <div className="w-full flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant w-8 text-right">0:00</span>
            <div className="flex-1 h-1 bg-zinc-800 rounded-full relative group cursor-pointer player-slider">
              <div className="absolute top-0 left-0 h-full w-[0%] bg-white group-hover:bg-primary rounded-full"></div>
              <div className="absolute top-1/2 left-[0%] w-3 h-3 bg-white rounded-full -translate-y-1/2 -translate-x-1/2 opacity-0 player-slider-thumb shadow-lg"></div>
            </div>
            <span className="text-[11px] text-on-surface-variant w-8">3:00</span>
          </div>
        </div>

        {/* Utilities */}
        <div className="flex items-center justify-end gap-3 w-[30%]">
          <button className="text-on-surface-variant hover:text-white"><span className="material-symbols-outlined text-lg">mic</span></button>
          <button className="text-on-surface-variant hover:text-white"><span className="material-symbols-outlined text-lg">queue_music</span></button>
          <button className="text-on-surface-variant hover:text-white"><span className="material-symbols-outlined text-lg">devices</span></button>
          <div className="flex items-center gap-2 group w-32">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">volume_up</span>
            <div className="flex-1 h-1 bg-zinc-800 rounded-full relative cursor-pointer group-hover:bg-zinc-700">
              <div className="absolute top-0 left-0 h-full w-[80%] bg-white group-hover:bg-primary rounded-full"></div>
            </div>
          </div>
          <button className="text-on-surface-variant hover:text-white"><span className="material-symbols-outlined text-lg">fullscreen</span></button>
        </div>
      </footer>
    </div>
  );
}
