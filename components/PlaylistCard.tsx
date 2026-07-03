"use client";

import Link from "next/link";
import { Playlist } from "@/lib/playlists";
import { usePlayback } from "@/context/PlayerContext";

interface PlaylistCardProps {
  playlist: Playlist;
}

export default function PlaylistCard({ playlist }: PlaylistCardProps) {
  const { playTrack, currentTrack, isPlaying, handlePlayPause } = usePlayback();

  const isCurrentPlaylistPlaying = 
    currentTrack && 
    playlist.tracks.some(t => t.id === currentTrack.id) && 
    isPlaying;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (playlist.tracks.length === 0) return;

    if (currentTrack && playlist.tracks.some(t => t.id === currentTrack.id)) {
      // Toggle play pause if a track from this playlist is already loaded
      handlePlayPause();
    } else {
      // Start playing the first track of this playlist and load the entire playlist as the queue
      playTrack(playlist.tracks[0], playlist.tracks);
    }
  };

  return (
    <Link 
      href={`/playlist/${playlist.id}`}
      className="spotify-card p-4 rounded-lg group cursor-pointer relative flex flex-col h-full transition-all duration-300"
    >
      <div className="relative mb-4 shrink-0">
        <div className="aspect-square bg-zinc-800 rounded-md shadow-2xl overflow-hidden relative">
          <img 
            className="w-full h-full object-cover select-none pointer-events-none group-hover:scale-105 transition-transform duration-300" 
            src={playlist.imageUrl || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80"}
            alt={playlist.name}
          />
        </div>
        <button 
          onClick={handlePlayClick}
          className="absolute bottom-2 right-2 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl play-button-hover text-black hover:scale-105 active:scale-95 transition-all"
          title={isCurrentPlaylistPlaying ? "Pause" : "Play Playlist"}
        >
          <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            {isCurrentPlaylistPlaying ? "pause" : "play_arrow"}
          </span>
        </button>
      </div>
      <div className="flex flex-col flex-1 min-h-0">
        <h4 className="font-bold text-sm truncate mb-1 text-white">{playlist.name}</h4>
        <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
          {playlist.description}
        </p>
        <span className="text-[10px] text-primary font-semibold mt-auto pt-2">
          {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
        </span>
      </div>
    </Link>
  );
}
