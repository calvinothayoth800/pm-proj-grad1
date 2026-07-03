"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlayback } from "@/context/PlayerContext";
import { Playlist, Track, DEFAULT_PLAYLISTS } from "@/lib/playlists";
import PlaylistCard from "@/components/PlaylistCard";

export default function Home() {
  const router = useRouter();
  const { playTrack } = usePlayback();

  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curatedPlaylists, setCuratedPlaylists] = useState<Playlist[]>([]);

  // Load curated playlists from localStorage on mount
  useEffect(() => {
    const loadCurated = () => {
      try {
        const stored = localStorage.getItem("curatedPlaylists");
        if (stored) {
          setCuratedPlaylists(JSON.parse(stored));
        }
      } catch (err) {
        console.error("Failed to load curated playlists:", err);
      }
    };

    loadCurated();

    window.addEventListener("curationAdded", loadCurated);
    return () => window.removeEventListener("curationAdded", loadCurated);
  }, []);

  const handleCurate = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);

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
      const tracks: Track[] = data.tracks || [];

      if (tracks.length > 0) {
        const newPlaylistId = `playlist-${Date.now()}`;
        const newPlaylistName = prompt.trim().length > 30 
          ? prompt.trim().substring(0, 27) + "..." 
          : prompt.trim();
          
        const newPlaylist: Playlist = {
          id: newPlaylistId,
          name: newPlaylistName.charAt(0).toUpperCase() + newPlaylistName.slice(1),
          description: `Custom AI curation based on: "${prompt}"`,
          imageUrl: tracks[0].imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80",
          tracks: tracks,
          isCurated: true,
        };

        // Save to local storage
        const stored = localStorage.getItem("curatedPlaylists");
        const existing: Playlist[] = stored ? JSON.parse(stored) : [];
        const updated = [newPlaylist, ...existing];
        localStorage.setItem("curatedPlaylists", JSON.stringify(updated));

        // Trigger updates in other components
        window.dispatchEvent(new Event("curationAdded"));

        // Load into player queue and play first song
        playTrack(tracks[0], tracks);

        // Clear search prompt and redirect to playlist page
        setPrompt("");
        router.push(`/playlist/${newPlaylistId}`);
      } else {
        throw new Error("No tracks found matching this vibe. Try adjusting constraints.");
      }
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setPrompt("");
    setError(null);
  };

  const handleClearLibrary = () => {
    if (confirm("Are you sure you want to clear all curated playlists?")) {
      localStorage.removeItem("curatedPlaylists");
      setCuratedPlaylists([]);
      window.dispatchEvent(new Event("curationAdded"));
    }
  };

  return (
    <>
      {/* Top Sticky Header */}
      <header className="sticky top-0 h-16 px-6 flex items-center justify-between z-20 bg-[#121212]/80 backdrop-blur-md shrink-0">
        <div className="flex gap-2">
          <button 
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors" 
            title="Go back"
          >
            <span className="material-symbols-outlined text-white">chevron_left</span>
          </button>
          <button 
            onClick={() => router.forward()}
            className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors" 
            title="Go forward"
          >
            <span className="material-symbols-outlined text-white">chevron_right</span>
          </button>
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
      <section className="vibe-hero px-6 pt-2 pb-8 flex-shrink-0">
        <div className="flex items-center gap-2 mb-6 select-none">
          <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>album</span>
          <h1 className="text-3xl font-extrabold tracking-tight">Crate Digger AI</h1>
        </div>
        <div className="w-full">
          <h2 className="text-4xl sm:text-5xl font-black mb-6 select-none tracking-tight">What&apos;s the vibe?</h2>
          <div className="flex flex-col md:flex-row gap-4 items-stretch mb-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              className="flex-1 min-h-[140px] bg-[#2a2a2a] border-none rounded-lg p-6 text-lg focus:ring-0 placeholder:text-zinc-500 resize-none focus:outline-none focus:bg-[#323232] transition-colors"
              placeholder="Describe the mood, instruments, or energy you're looking for... (e.g., 'Late night driving through a neon city')"
            ></textarea>
            
            <div className="flex flex-col gap-3 justify-center w-full md:w-[220px] shrink-0">
              <button
                onClick={handleCurate}
                disabled={isLoading || !prompt.trim()}
                className="w-full bg-primary hover:bg-[#1ed760] disabled:bg-primary/50 text-black font-bold py-3.5 rounded-full transition-all text-sm uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer"
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
              <button
                onClick={handleClear}
                disabled={isLoading}
                className="w-full bg-transparent hover:bg-white/10 text-white font-bold py-3.5 rounded-full transition-all text-sm uppercase tracking-wider disabled:opacity-50 border border-white/20 hover:border-white/40 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Explore Option Chips */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-on-surface-variant font-medium flex items-center gap-1.5 mr-1 select-none">
              <span className="material-symbols-outlined text-sm text-primary">explore</span> Explore:
            </span>
            {[
              "Late night driving through a neon city",
              "Chill lofi hip-hop beats for coding",
              "Energetic dance music for working out",
              "Warm acoustic folk for a rainy morning",
              "Heavy dark industrial techno beats",
              "Spacious ambient soundscapes for study"
            ].map((vibe) => (
              <button 
                key={vibe} 
                onClick={() => setPrompt(vibe)}
                disabled={isLoading}
                className="px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#3e3e3e] active:scale-95 text-xs font-semibold text-white rounded-full transition-all border border-zinc-800 hover:border-zinc-700 select-none text-left cursor-pointer"
                title={`Autofill: "${vibe}"`}
              >
                {vibe}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Playlists Display */}
      <section className="px-6 pb-28 flex-1">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-lg mb-6 flex items-center gap-3 select-none">
            <span className="material-symbols-outlined text-red-500">error</span>
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Curated Section */}
        {curatedPlaylists.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-white tracking-tight">Your Curated Vibes</h3>
              <button 
                onClick={handleClearLibrary}
                className="text-on-surface-variant hover:text-red-400 text-xs font-semibold transition-colors flex items-center gap-1"
                title="Clear library"
              >
                <span className="material-symbols-outlined text-sm">delete</span> Clear All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {curatedPlaylists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          </div>
        )}

        {/* Featured Section */}
        <div>
          <h3 className="text-2xl font-bold mb-4 text-white tracking-tight">Featured Playlists</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {DEFAULT_PLAYLISTS.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
