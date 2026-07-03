"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePlayback } from "@/context/PlayerContext";
import { Playlist, Track, DEFAULT_PLAYLISTS } from "@/lib/playlists";

export default function PlaylistDetails() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const { playTrack, currentTrack, isPlaying, handlePlayPause } = usePlayback();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchPlaylist = () => {
      setLoading(true);
      // 1. Check default static playlists
      const foundDefault = DEFAULT_PLAYLISTS.find((p) => p.id === id);
      if (foundDefault) {
        setPlaylist(foundDefault);
        setLoading(false);
        return;
      }

      // 2. Check client-side curated playlists in localStorage
      try {
        const stored = localStorage.getItem("curatedPlaylists");
        if (stored) {
          const curated: Playlist[] = JSON.parse(stored);
          const foundCurated = curated.find((p) => p.id === id);
          if (foundCurated) {
            setPlaylist(foundCurated);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Error reading curated playlist details:", err);
      }

      setPlaylist(null);
      setLoading(false);
    };

    fetchPlaylist();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col p-6 animate-pulse">
        <header className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-zinc-800"></div>
          <div className="w-8 h-8 rounded-full bg-zinc-800"></div>
        </header>
        <div className="flex flex-col sm:flex-row items-end gap-6 mb-8">
          <div className="w-48 h-48 bg-zinc-800 rounded-md shadow-2xl shrink-0"></div>
          <div className="flex-1 flex flex-col gap-4">
            <div className="h-4 bg-zinc-800 rounded w-16"></div>
            <div className="h-12 bg-zinc-800 rounded w-2/3"></div>
            <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
          </div>
        </div>
        <div className="flex flex-col gap-4 mt-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-zinc-800 rounded-md"></div>
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
        <span className="material-symbols-outlined text-6xl text-zinc-600 mb-4">search_off</span>
        <h2 className="text-2xl font-bold mb-2">Playlist Not Found</h2>
        <p className="text-on-surface-variant mb-6 max-w-md">
          The playlist you are looking for does not exist or has been deleted.
        </p>
        <button
          onClick={() => router.push("/")}
          className="bg-white text-black font-bold px-6 py-2.5 rounded-full hover:scale-105 transition-transform"
        >
          Go Back Home
        </button>
      </div>
    );
  }

  const isCurrentPlaylistPlaying =
    currentTrack &&
    playlist.tracks.some((t) => t.id === currentTrack.id) &&
    isPlaying;

  const handlePlayPlaylist = () => {
    if (playlist.tracks.length === 0) return;

    const firstTrackInPlaylist = playlist.tracks[0];
    const isTrackFromPlaylistLoaded = currentTrack && playlist.tracks.some((t) => t.id === currentTrack.id);

    if (isTrackFromPlaylistLoaded) {
      handlePlayPause();
    } else {
      playTrack(firstTrackInPlaylist, playlist.tracks);
    }
  };

  const handleTrackRowClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      handlePlayPause();
    } else {
      playTrack(track, playlist.tracks);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Dynamic Header Controls */}
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

      {/* Playlist Hero Section */}
      <div className="vibe-hero px-6 pt-2 pb-6 flex flex-col sm:flex-row items-end gap-6 shrink-0 bg-gradient-to-b from-zinc-800 to-surface">
        <div className="w-48 h-48 bg-zinc-800 rounded-md shadow-2xl overflow-hidden shrink-0">
          <img
            className="w-full h-full object-cover pointer-events-none"
            src={playlist.imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"}
            alt={playlist.name}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-primary mb-1">
            Playlist
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white mb-3 tracking-tight break-words">
            {playlist.name}
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant mb-3 leading-relaxed">
            {playlist.description}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-white">
            <span className="font-bold hover:underline cursor-pointer">Crate Digger AI</span>
            <span className="text-on-surface-variant">•</span>
            <span>{playlist.tracks.length} songs,</span>
            <span className="text-on-surface-variant">about 2 min 30 sec</span>
          </div>
        </div>
      </div>

      {/* Playlist Controls & Songs list */}
      <div className="px-6 pb-28 flex-1">
        {/* Play Bar controls */}
        <div className="flex items-center gap-6 py-6">
          <button
            onClick={handlePlayPlaylist}
            className="w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 shadow-xl transition-all cursor-pointer"
            title={isCurrentPlaylistPlaying ? "Pause Playlist" : "Play Playlist"}
          >
            <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors" title="Save to library">
            <span className="material-symbols-outlined text-3xl">favorite</span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors" title="More options">
            <span className="material-symbols-outlined text-3xl">more_horiz</span>
          </button>
        </div>

        {/* Songs Table Header */}
        <div className="grid grid-cols-[40px_1fr_80px_60px] border-b border-zinc-800 pb-2 px-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant select-none">
          <span className="text-center">#</span>
          <span>Title</span>
          <span className="text-center">Link</span>
          <span className="text-right">
            <span className="material-symbols-outlined text-lg">schedule</span>
          </span>
        </div>

        {/* Songs List */}
        <div className="flex flex-col mt-2">
          {playlist.tracks.map((track, index) => {
            const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
            const isTrackLoaded = currentTrack?.id === track.id;

            return (
              <div
                key={track.id}
                onClick={() => handleTrackRowClick(track)}
                className={`grid grid-cols-[40px_1fr_80px_60px] items-center py-2.5 px-4 rounded-md group hover:bg-white/10 transition-colors cursor-pointer ${
                  isTrackLoaded ? "bg-white/5" : ""
                }`}
              >
                {/* Index / Hover Play State */}
                <div className="flex items-center justify-center relative text-sm text-on-surface-variant font-medium select-none">
                  <span className="group-hover:hidden">
                    {isTrackPlaying ? (
                      <span className="material-symbols-outlined text-primary text-sm animate-pulse">volume_up</span>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="hidden group-hover:inline material-symbols-outlined text-white text-base">
                    {isTrackPlaying ? "pause" : "play_arrow"}
                  </span>
                </div>

                {/* Cover art + Title & Artist */}
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    className="w-10 h-10 rounded object-cover pointer-events-none shrink-0"
                    src={track.imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80"}
                    alt={track.name}
                  />
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`text-sm font-medium truncate ${
                        isTrackLoaded ? "text-primary" : "text-white"
                      }`}
                    >
                      {track.name}
                    </span>
                    <span className="text-xs text-on-surface-variant truncate">
                      {track.artist}
                    </span>
                  </div>
                </div>

                {/* Spotify Web Link */}
                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                  {track.url ? (
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
                      title="Open in Spotify Web Player"
                    >
                      <span className="material-symbols-outlined text-lg">open_in_new</span>
                    </a>
                  ) : (
                    <span className="text-zinc-700 select-none text-sm">-</span>
                  )}
                </div>

                {/* Duration */}
                <div className="text-right text-xs text-on-surface-variant font-medium select-none">
                  0:30
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
