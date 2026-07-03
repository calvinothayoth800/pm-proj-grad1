"use client";

import { useState, useEffect, useRef } from "react";

interface Track {
  id: string;
  name: string;
  artist: string;
  url: string;
  imageUrl?: string;
  previewUrl?: string;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Track[]>([]);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Partial<Track>>({
    name: "Analog Dreams",
    artist: "Crate Master Vol. 4",
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBjQd6U4epCLv3_s0NIkd3IJ-5dVyvCENZz8UUF3xz-JLVLXsdPCEJJJcb4GMbxDDSj-2nJEHJPCasCpMtRObDp9s4QPnfg9vGYEfg34BEJBDOEc-4obJjKZK1gMuBpuXafncsr-pl4sixNABwn7DAx94ua8xEpEHLA-MwLoOGDAm-45Fj0TC8E4fNg2LPB5LuDPSXZXCTr1-LuBkxWIXmSn2eEX6QBzCiLp_lZ2vt9t9MDCVGoC842HItdTlFYTFdCyqwhXoBpOqv2",
    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressSliderRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);

  const [libraryFilter, setLibraryFilter] = useState<"all" | "playlists" | "artists" | "albums">("all");
  const [volume, setVolume] = useState(80);
  const [songProgress, setSongProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const updateProgressFromEvent = (clientX: number) => {
    const slider = progressSliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
    setSongProgress(percent);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (percent / 100) * audioRef.current.duration;
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    updateProgressFromEvent(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateProgressFromEvent(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const updateVolumeFromEvent = (clientX: number) => {
    const slider = volumeSliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
    setVolume(percent);
    if (audioRef.current) {
      audioRef.current.volume = percent / 100;
    }
  };

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    updateVolumeFromEvent(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateVolumeFromEvent(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Butter-smooth progress animation loop (60 FPS)
  useEffect(() => {
    let animationFrameId: number;

    const updateFrame = () => {
      if (audioRef.current && isPlaying && !audioRef.current.paused) {
        const audio = audioRef.current;
        if (audio.duration) {
          setSongProgress((audio.currentTime / audio.duration) * 100);
        }
        animationFrameId = requestAnimationFrame(updateFrame);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateFrame);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  // Backwards compatibility for mock playback ticker (if they toggle play pause without selecting a track)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && !audioRef.current) {
      interval = setInterval(() => {
        setSongProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setSongProgress(0);
  };

  const handleSelectTrack = (track: Track) => {
    setCurrentTrack(track);

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const previewSrc = track.previewUrl || (track.id === "analog-dreams-mock" 
      ? "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3"
      : track.id === "neon-pulse-mock"
      ? "https://dl.espressif.com/dl/audio/ff-16b-1c-44100hz.mp3"
      : track.id === "lofi-cityscape-mock"
      ? "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3"
      : "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3");

    if (previewSrc) {
      const audio = new Audio(previewSrc);
      audio.volume = volume / 100;
      audioRef.current = audio;
      setIsPlaying(true);
      
      audio.play().catch(err => {
        console.log("Autoplay blocked or failed:", err);
      });

      audio.onended = () => {
        setIsPlaying(false);
        setSongProgress(0);
      };
    } else {
      audioRef.current = null;
      setIsPlaying(false);
      setSongProgress(0);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) {
      const previewSrc = currentTrack.previewUrl || (currentTrack.id === "analog-dreams-mock" 
        ? "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3"
        : currentTrack.id === "neon-pulse-mock"
        ? "https://dl.espressif.com/dl/audio/ff-16b-1c-44100hz.mp3"
        : currentTrack.id === "lofi-cityscape-mock"
        ? "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3"
        : "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3");

      if (previewSrc) {
        const audio = new Audio(previewSrc);
        audio.volume = volume / 100;
        audioRef.current = audio;
        setIsPlaying(true);
        audio.play().catch(err => console.log("Play failed:", err));

        audio.onended = () => {
          setIsPlaying(false);
          setSongProgress(0);
        };
      } else {
        setIsPlaying(!isPlaying);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.log("Play failed:", err));
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden p-2 gap-2">
      {/* Spotify Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] gap-2 shrink-0">
        {/* Top Nav */}
        <div className="bg-surface rounded-lg p-4 flex flex-col gap-4">
          <a className="flex items-center gap-5 px-2 spotify-sidebar-item active" href="#" title="Home">
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
            <span className="font-bold text-sm">Home</span>
          </a>
          <a className="flex items-center gap-5 px-2 spotify-sidebar-item" href="#" title="Search">
            <span className="material-symbols-outlined text-2xl">search</span>
            <span className="font-bold text-sm">Search</span>
          </a>
        </div>
        {/* Library Section */}
        <div className="bg-surface rounded-lg flex-1 flex flex-col overflow-hidden">
          <div className="p-4 flex items-center justify-between shadow-lg z-10">
            <button className="flex items-center gap-3 spotify-sidebar-item" title="Your Library">
              <span className="material-symbols-outlined text-2xl">library_music</span>
              <span className="font-bold text-sm">Your Library</span>
            </button>
            <div className="flex gap-2">
              <button className="p-1 spotify-sidebar-item" title="Create playlist or folder"><span className="material-symbols-outlined">add</span></button>
              <button className="p-1 spotify-sidebar-item" title="Show more"><span className="material-symbols-outlined">arrow_forward</span></button>
            </div>
          </div>
          {/* Library Tags */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-hidden">
            <span 
              onClick={() => setLibraryFilter(libraryFilter === "playlists" ? "all" : "playlists")}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                libraryFilter === "playlists" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
              }`}
              title="Filter by Playlists"
            >
              Playlists
            </span>
            <span 
              onClick={() => setLibraryFilter(libraryFilter === "artists" ? "all" : "artists")}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                libraryFilter === "artists" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
              }`}
              title="Filter by Artists"
            >
              Artists
            </span>
            <span 
              onClick={() => setLibraryFilter(libraryFilter === "albums" ? "all" : "albums")}
              className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                libraryFilter === "albums" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
              }`}
              title="Filter by Albums"
            >
              Albums
            </span>
          </div>
          {/* Library List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
            {(libraryFilter === "all" || libraryFilter === "playlists") && (
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer" title="Liked Songs">
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
            )}
            {(libraryFilter === "all" || libraryFilter === "playlists") && (
              <div className="flex items-center gap-3 p-2 rounded-md bg-white/10 cursor-pointer" title="Crate Digger AI">
                <div className="w-12 h-12 bg-[#1db954]/20 rounded flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>album</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">Crate Digger AI</span>
                  <span className="text-xs text-on-surface-variant">Feature • Curate Vibe</span>
                </div>
              </div>
            )}
            {(libraryFilter === "all" || libraryFilter === "albums") && (
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer opacity-70" title="Midnight City (M83)">
                <img className="w-12 h-12 rounded object-cover pointer-events-none" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFqg3Lmx2d40nxulFeqoAZx5YxxVJPraayqWajoMK1Yas8ReIzTug-BxIlvsBeToZgP5zmHf7DxsLXpzCqD0caLBQoNC5yBLbPRrm-eL6VT6T4p4oJpt6BFCZPTqT7_1L1eJciMQw6GIumKWiHyOCLqHU-1VvAz310unx_Xl5bVBUN-L5t3gHrbnVlGC6ISXDYOkGIur2-KL-1PDRWPn3bW1A0n2kyeEzMSsnMT9I0tAmgMN2t8A1mMgdNW-Qj6XNKyRx6udtzgw1-"/>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">Midnight City</span>
                  <span className="text-xs text-on-surface-variant">Album • M83</span>
                </div>
              </div>
            )}
            {libraryFilter === "artists" && (
              <div className="p-4 text-xs text-on-surface-variant text-center">
                No artists followed yet.
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-surface rounded-lg overflow-y-auto custom-scrollbar relative flex flex-col">
        {/* Top Sticky Header */}
        <header className="sticky top-0 h-16 px-6 flex items-center justify-between z-20 bg-[#121212]/80 backdrop-blur-md">
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors" title="Go back"><span className="material-symbols-outlined text-white">chevron_left</span></button>
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center opacity-50" title="Go forward"><span className="material-symbols-outlined text-white">chevron_right</span></button>
          </div>
          <div className="flex items-center gap-4">
            <button className="bg-white text-black px-2.5 py-1 rounded-full text-xs font-bold hover:scale-105 transition-transform shrink-0" title="Explore Premium">Explore Premium</button>
            <button className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors" title="Notifications"><span className="material-symbols-outlined text-white text-[20px]">notifications</span></button>
            <button className="w-8 h-8 rounded-full bg-black/40 p-1 flex items-center justify-center hover:bg-black/60 transition-colors" title="Profile">
              <div className="w-full h-full rounded-full bg-zinc-600 pointer-events-none"></div>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-28">
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
                    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBjQd6U4epCLv3_s0NIkd3IJ-5dVyvCENZz8UUF3xz-JLVLXsdPCEJJJcb4GMbxDDSj-2nJEHJPCasCpMtRObDp9s4QPnfg9vGYEfg34BEJBDOEc-4obJjKZK1gMuBpuXafncsr-pl4sixNABwn7DAx94ua8xEpEHLA-MwLoOGDAm-45Fj0TC8E4fNg2LPB5LuDPSXZXCTr1-LuBkxWIXmSn2eEX6QBzCiLp_lZ2vt9t9MDCVGoC842HItdTlFYTFdCyqwhXoBpOqv2",
                    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
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
                    imageUrl: "",
                    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
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
                    imageUrl: "",
                    previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
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
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Spotify Player Bar */}
      <footer className="h-[90px] bg-black px-4 flex items-center justify-between z-50 fixed bottom-0 left-0 right-0 border-t border-zinc-900">
        {/* Current Track */}
        <div className="flex items-center gap-4 w-[30%]">
          <div className="w-14 h-14 rounded overflow-hidden shadow-lg group relative flex-shrink-0 bg-zinc-800 flex items-center justify-center select-none" title="Cover Art">
            {currentTrack.imageUrl ? (
              <img className="w-full h-full object-cover pointer-events-none select-none" src={currentTrack.imageUrl} alt={currentTrack.name}/>
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
          <button className="text-on-surface-variant hover:text-primary transition-colors ml-2" title="Save to Your Library">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
          </button>
        </div>

        {/* Player Controls */}
        <div className="flex flex-col items-center gap-2 max-w-[40%] w-full">
          <div className="flex items-center gap-6">
            <button className="text-on-surface-variant hover:text-white transition-colors" title="Shuffle"><span className="material-symbols-outlined text-xl">shuffle</span></button>
            <button className="text-on-surface-variant hover:text-white transition-colors" title="Previous"><span className="material-symbols-outlined text-3xl">skip_previous</span></button>
            <button 
              onClick={handlePlayPause}
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
              title={isPlaying ? "Pause" : "Play"}
            >
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{isPlaying ? "pause" : "play_arrow"}</span>
            </button>
            <button className="text-on-surface-variant hover:text-white transition-colors" title="Next"><span className="material-symbols-outlined text-3xl">skip_next</span></button>
            <button className="text-on-surface-variant hover:text-white transition-colors" title="Repeat"><span className="material-symbols-outlined text-xl">repeat</span></button>
          </div>
          <div className="w-full flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant w-8 text-right">
              {Math.floor((songProgress * 1.8) / 60)}:{Math.floor((songProgress * 1.8) % 60) < 10 ? "0" : ""}{Math.floor((songProgress * 1.8) % 60)}
            </span>
            <div 
              ref={progressSliderRef}
              onMouseDown={handleProgressMouseDown}
              className="flex-1 h-1 bg-zinc-800 rounded-full relative group cursor-pointer player-slider"
              title="Seek"
            >
              <div className="absolute top-0 left-0 h-full bg-white group-hover:bg-primary rounded-full pointer-events-none" style={{ width: `${songProgress}%` }}></div>
              <div className="absolute top-1/2 w-3 h-3 bg-white rounded-full -translate-y-1/2 -translate-x-1/2 opacity-0 player-slider-thumb shadow-lg pointer-events-none" style={{ left: `${songProgress}%` }}></div>
            </div>
            <span className="text-[11px] text-on-surface-variant w-8">3:00</span>
          </div>
        </div>

        {/* Utilities */}
        <div className="flex items-center justify-end gap-3 w-[30%]">
          <button className="text-on-surface-variant hover:text-white" title="Lyrics"><span className="material-symbols-outlined text-lg">mic</span></button>
          <button className="text-on-surface-variant hover:text-white" title="Queue"><span className="material-symbols-outlined text-lg">queue_music</span></button>
          <button className="text-on-surface-variant hover:text-white" title="Connect to a device"><span className="material-symbols-outlined text-lg">devices</span></button>
          <div className="flex items-center gap-2 group w-32" title="Volume">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">
              {volume === 0 ? "volume_off" : volume < 50 ? "volume_down" : "volume_up"}
            </span>
            <div 
              ref={volumeSliderRef}
              onMouseDown={handleVolumeMouseDown}
              className="flex-1 h-1 bg-zinc-800 rounded-full relative cursor-pointer group-hover:bg-zinc-700"
            >
              <div className="absolute top-0 left-0 h-full bg-white group-hover:bg-primary rounded-full pointer-events-none" style={{ width: `${volume}%` }}></div>
            </div>
          </div>
          <button className="text-on-surface-variant hover:text-white" title="Fullscreen"><span className="material-symbols-outlined text-lg">fullscreen</span></button>
        </div>
      </footer>
    </div>
  );
}
