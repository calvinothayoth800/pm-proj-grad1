"use client";

import { usePlayback } from "@/context/PlayerContext";

export default function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    songProgress,
    volume,
    handlePlayPause,
    handleNextTrack,
    handlePrevTrack,
    progressSliderRef,
    volumeSliderRef,
    handleProgressMouseDown,
    handleVolumeMouseDown,
  } = usePlayback();

  if (!currentTrack) {
    return (
      <footer className="h-[90px] bg-black px-4 flex items-center justify-center z-50 fixed bottom-0 left-0 right-0 border-t border-zinc-900 select-none">
        <p className="text-sm text-on-surface-variant">Select a track to start playing</p>
      </footer>
    );
  }

  // Calculate elapsed time (assuming a fixed 3:00 max duration for previews, i.e., 180 seconds)
  const elapsedSeconds = Math.floor((songProgress / 100) * 30); // Spotify previews are 30s max
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedSecondsRemaining = elapsedSeconds % 60;
  const elapsedFormatted = `${elapsedMinutes}:${elapsedSecondsRemaining < 10 ? "0" : ""}${elapsedSecondsRemaining}`;

  return (
    <footer className="h-[90px] bg-black px-4 flex items-center justify-between z-50 fixed bottom-0 left-0 right-0 border-t border-zinc-900 select-none">
      {/* Current Track Info */}
      <div className="flex items-center gap-4 w-[30%] min-w-[200px]">
        <div className="w-14 h-14 rounded overflow-hidden shadow-lg group relative flex-shrink-0 bg-zinc-800 flex items-center justify-center" title="Cover Art">
          {currentTrack.imageUrl ? (
            <img 
              className="w-full h-full object-cover pointer-events-none" 
              src={currentTrack.imageUrl} 
              alt={currentTrack.name}
            />
          ) : (
            <span className="material-symbols-outlined text-zinc-400 text-3xl">music_note</span>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          {currentTrack.url ? (
            <a 
              className="text-sm font-medium hover:underline text-white truncate" 
              href={currentTrack.url} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              {currentTrack.name}
            </a>
          ) : (
            <span className="text-sm font-medium text-white truncate">{currentTrack.name}</span>
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
          <button className="text-on-surface-variant hover:text-white transition-colors" title="Shuffle">
            <span className="material-symbols-outlined text-xl">shuffle</span>
          </button>
          <button 
            className="text-on-surface-variant hover:text-white transition-colors" 
            title="Previous" 
            onClick={handlePrevTrack}
          >
            <span className="material-symbols-outlined text-3xl">skip_previous</span>
          </button>
          <button 
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
            title={isPlaying ? "Pause" : "Play"}
          >
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
          <button 
            className="text-on-surface-variant hover:text-white transition-colors" 
            title="Next" 
            onClick={handleNextTrack}
          >
            <span className="material-symbols-outlined text-3xl">skip_next</span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors" title="Repeat">
            <span className="material-symbols-outlined text-xl">repeat</span>
          </button>
        </div>
        <div className="w-full flex items-center gap-2">
          <span className="text-[11px] text-on-surface-variant w-8 text-right">
            {elapsedFormatted}
          </span>
          <div 
            ref={progressSliderRef}
            onMouseDown={handleProgressMouseDown}
            className="flex-1 h-1 bg-zinc-800 rounded-full relative group cursor-pointer player-slider"
            title="Seek"
          >
            <div 
              className="absolute top-0 left-0 h-full bg-white group-hover:bg-primary rounded-full pointer-events-none" 
              style={{ width: `${songProgress}%` }}
            ></div>
            <div 
              className="absolute top-1/2 w-3 h-3 bg-white rounded-full -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 player-slider-thumb shadow-lg pointer-events-none transition-opacity" 
              style={{ left: `${songProgress}%` }}
            ></div>
          </div>
          <span className="text-[11px] text-on-surface-variant w-8">0:30</span>
        </div>
      </div>

      {/* Utilities */}
      <div className="flex items-center justify-end gap-3 w-[30%] min-w-[200px]">
        <button className="text-on-surface-variant hover:text-white" title="Lyrics">
          <span className="material-symbols-outlined text-lg">mic</span>
        </button>
        <button className="text-on-surface-variant hover:text-white" title="Queue">
          <span className="material-symbols-outlined text-lg">queue_music</span>
        </button>
        <button className="text-on-surface-variant hover:text-white" title="Connect to a device">
          <span className="material-symbols-outlined text-lg">devices</span>
        </button>
        <div className="flex items-center gap-2 group w-24 sm:w-32" title="Volume">
          <span className="material-symbols-outlined text-on-surface-variant text-lg">
            {volume === 0 ? "volume_off" : volume < 50 ? "volume_down" : "volume_up"}
          </span>
          <div 
            ref={volumeSliderRef}
            onMouseDown={handleVolumeMouseDown}
            className="flex-1 h-1 bg-zinc-800 rounded-full relative cursor-pointer group-hover:bg-zinc-700"
          >
            <div 
              className="absolute top-0 left-0 h-full bg-white group-hover:bg-primary rounded-full pointer-events-none" 
              style={{ width: `${volume}%` }}
            ></div>
          </div>
        </div>
        <button className="text-on-surface-variant hover:text-white" title="Fullscreen">
          <span className="material-symbols-outlined text-lg">fullscreen</span>
        </button>
      </div>
    </footer>
  );
}
