"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Track } from "@/lib/playlists";

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  songProgress: number;
  volume: number;
  queue: Track[];
  playTrack: (track: Track, newQueue?: Track[]) => void;
  handlePlayPause: () => void;
  handleNextTrack: () => void;
  handlePrevTrack: () => void;
  setVolume: (vol: number) => void;
  seek: (percent: number) => void;
  progressSliderRef: React.RefObject<HTMLDivElement | null>;
  volumeSliderRef: React.RefObject<HTMLDivElement | null>;
  handleProgressMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleVolumeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [songProgress, setSongProgress] = useState(0);
  const [volume, setVolume] = useState(80);
  const [queue, setQueue] = useState<Track[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressSliderRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);

  const queueRef = useRef<Track[]>([]);
  const currentTrackRef = useRef<Track | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Smooth animation for song progress (60 FPS)
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

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const playTrack = (track: Track, newQueue?: Track[]) => {
    if (newQueue) {
      setQueue(newQueue);
      queueRef.current = newQueue;
    }

    setCurrentTrack(track);
    currentTrackRef.current = track;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    // Determine preview source URL
    let previewSrc = track.previewUrl;
    if (!previewSrc) {
      previewSrc = "https://dl.espressif.com/dl/audio/ff-16b-2c-44100hz.mp3";
    }

    const audio = new Audio(previewSrc);
    audio.volume = volume / 100;
    audioRef.current = audio;
    setIsPlaying(true);
    setSongProgress(0);

    audio.play().catch((err) => {
      console.log("Audio autoplay blocked or failed:", err);
    });

    audio.onended = () => {
      handleNextTrack();
    };
  };

  const handlePlayPause = () => {
    if (!audioRef.current) {
      // If we have a current track loaded but no audio element initialized
      if (currentTrack) {
        playTrack(currentTrack);
      } else if (queueRef.current.length > 0) {
        playTrack(queueRef.current[0]);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((err) => console.log("Play failed:", err));
      setIsPlaying(true);
    }
  };

  const handleNextTrack = () => {
    const activeQueue = queueRef.current;
    const activeTrack = currentTrackRef.current;
    if (activeQueue.length === 0) return;

    const currentIndex = activeQueue.findIndex((t) => t.id === activeTrack?.id);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activeQueue.length;
    playTrack(activeQueue[nextIndex]);
  };

  const handlePrevTrack = () => {
    const activeQueue = queueRef.current;
    const activeTrack = currentTrackRef.current;
    if (activeQueue.length === 0) return;

    const currentIndex = activeQueue.findIndex((t) => t.id === activeTrack?.id);
    const prevIndex =
      currentIndex === -1
        ? activeQueue.length - 1
        : (currentIndex - 1 + activeQueue.length) % activeQueue.length;
    playTrack(activeQueue[prevIndex]);
  };

  const seek = (percent: number) => {
    setSongProgress(percent);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (percent / 100) * audioRef.current.duration;
    }
  };

  const updateProgressFromEvent = (clientX: number) => {
    const slider = progressSliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
    seek(percent);
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

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        songProgress,
        volume,
        queue,
        playTrack,
        handlePlayPause,
        handleNextTrack,
        handlePrevTrack,
        setVolume,
        seek,
        progressSliderRef,
        volumeSliderRef,
        handleProgressMouseDown,
        handleVolumeMouseDown,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayback = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayback must be used within a PlaybackProvider");
  }
  return context;
};
