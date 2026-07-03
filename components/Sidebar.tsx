"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Playlist, DEFAULT_PLAYLISTS } from "@/lib/playlists";

export default function Sidebar() {
  const pathname = usePathname();
  const [libraryFilter, setLibraryFilter] = useState<"all" | "playlists" | "artists" | "albums">("all");
  const [playlists, setPlaylists] = useState<Playlist[]>(DEFAULT_PLAYLISTS);

  useEffect(() => {
    // Load curated playlists from localStorage and combine with defaults
    const loadPlaylists = () => {
      try {
        const stored = localStorage.getItem("curatedPlaylists");
        if (stored) {
          const curated: Playlist[] = JSON.parse(stored);
          setPlaylists([...DEFAULT_PLAYLISTS, ...curated]);
        } else {
          setPlaylists(DEFAULT_PLAYLISTS);
        }
      } catch (err) {
        console.error("Failed to load curated playlists in sidebar:", err);
      }
    };

    loadPlaylists();

    // Listen for storage events (if user curates on the home page, the sidebar updates instantly)
    window.addEventListener("storage", loadPlaylists);
    window.addEventListener("curationAdded", loadPlaylists);

    return () => {
      window.removeEventListener("storage", loadPlaylists);
      window.removeEventListener("curationAdded", loadPlaylists);
    };
  }, []);

  return (
    <aside className="hidden md:flex flex-col w-[280px] gap-2 shrink-0">
      {/* Top Nav */}
      <div className="bg-surface rounded-lg p-4 flex flex-col gap-4">
        <Link 
          href="/" 
          className={`flex items-center gap-5 px-2 spotify-sidebar-item ${pathname === "/" ? "active text-white font-bold" : "text-on-surface-variant"}`}
          title="Home"
        >
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: pathname === "/" ? "'FILL' 1" : "'FILL' 0" }}>home</span>
          <span className="text-sm font-semibold">Home</span>
        </Link>
        <Link 
          href="/" 
          className="flex items-center gap-5 px-2 spotify-sidebar-item text-on-surface-variant"
          title="Search"
        >
          <span className="material-symbols-outlined text-2xl">search</span>
          <span className="text-sm font-semibold">Search</span>
        </Link>
      </div>

      {/* Library Section */}
      <div className="bg-surface rounded-lg flex-1 flex flex-col overflow-hidden">
        <div className="p-4 flex items-center justify-between shadow-lg z-10">
          <button className="flex items-center gap-3 spotify-sidebar-item text-on-surface-variant hover:text-white" title="Your Library">
            <span className="material-symbols-outlined text-2xl">library_music</span>
            <span className="font-bold text-sm">Your Library</span>
          </button>
          <div className="flex gap-2">
            <button className="p-1 spotify-sidebar-item text-on-surface-variant hover:text-white" title="Create playlist or folder">
              <span className="material-symbols-outlined">add</span>
            </button>
            <button className="p-1 spotify-sidebar-item text-on-surface-variant hover:text-white" title="Show more">
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Library Tags */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span 
            onClick={() => setLibraryFilter(libraryFilter === "playlists" ? "all" : "playlists")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              libraryFilter === "playlists" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
            }`}
            title="Filter by Playlists"
          >
            Playlists
          </span>
          <span 
            onClick={() => setLibraryFilter(libraryFilter === "artists" ? "all" : "artists")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              libraryFilter === "artists" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
            }`}
            title="Filter by Artists"
          >
            Artists
          </span>
          <span 
            onClick={() => setLibraryFilter(libraryFilter === "albums" ? "all" : "albums")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              libraryFilter === "albums" ? "bg-white text-black" : "bg-[#2a2a2a] text-white hover:bg-[#3e3e3e]"
            }`}
            title="Filter by Albums"
          >
            Albums
          </span>
        </div>

        {/* Library List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 flex flex-col gap-1">
          {/* Liked Songs */}
          {(libraryFilter === "all" || libraryFilter === "playlists") && (
            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer" title="Liked Songs">
              <div className="w-12 h-12 bg-primary rounded flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-white truncate">Liked Songs</span>
                <span className="text-xs text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>keep</span>
                  Playlist • 1,245 songs
                </span>
              </div>
            </div>
          )}

          {/* Dynamic Playlists List */}
          {(libraryFilter === "all" || libraryFilter === "playlists") && 
            playlists.map((playlist) => {
              const isActive = pathname === `/playlist/${playlist.id}`;
              return (
                <Link
                  key={playlist.id}
                  href={`/playlist/${playlist.id}`}
                  className={`flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors ${
                    isActive ? "bg-white/10" : ""
                  }`}
                  title={playlist.name}
                >
                  <img
                    className="w-12 h-12 rounded object-cover pointer-events-none shrink-0"
                    src={playlist.imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80"}
                    alt={playlist.name}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate ${isActive ? "text-primary" : "text-white"}`}>
                      {playlist.name}
                    </span>
                    <span className="text-xs text-on-surface-variant truncate">
                      {playlist.isCurated ? "Curated Playlist" : "Playlist"} • {playlist.tracks.length} songs
                    </span>
                  </div>
                </Link>
              );
            })}

          {/* Static Album */}
          {(libraryFilter === "all" || libraryFilter === "albums") && (
            <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 cursor-pointer opacity-70" title="Midnight City (M83)">
              <img className="w-12 h-12 rounded object-cover pointer-events-none shrink-0" src="https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80" alt="Midnight City"/>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-white truncate">Midnight City</span>
                <span className="text-xs text-on-surface-variant truncate">Album • M83</span>
              </div>
            </div>
          )}

          {libraryFilter === "artists" && (
            <div className="p-4 text-xs text-on-surface-variant text-center select-none">
              No artists followed yet.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
