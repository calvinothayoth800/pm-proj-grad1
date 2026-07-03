export interface Track {
  id: string;
  name: string;
  artist: string;
  url: string;
  imageUrl?: string;
  previewUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  tracks: Track[];
  isCurated?: boolean;
}

export const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: "analog-dreams",
    name: "Analog Dreams",
    description: "Synth-heavy, dreamy textures for your late night drives.",
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    tracks: [
      {
        id: "analog-dreams-mock-1",
        name: "Analog Dreams",
        artist: "Synth Master",
        url: "https://open.spotify.com/track/71378121",
        imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      },
      {
        id: "analog-dreams-mock-2",
        name: "Retro Sunrise",
        artist: "Synth Master",
        url: "https://open.spotify.com/track/71378122",
        imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
      },
      {
        id: "analog-dreams-mock-3",
        name: "Cyber City Vibe",
        artist: "Vector Kid",
        url: "https://open.spotify.com/track/71378123",
        imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
      },
      {
        id: "analog-dreams-mock-4",
        name: "Neon Outrun",
        artist: "Laserhawk",
        url: "https://open.spotify.com/track/71378124",
        imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
      },
      {
        id: "analog-dreams-mock-5",
        name: "Sunset Horizon",
        artist: "Neon Rider",
        url: "https://open.spotify.com/track/71378125",
        imageUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3"
      }
    ]
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    description: "High energy electronic pulses with a retro futuristic feel.",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
    tracks: [
      {
        id: "neon-pulse-mock-1",
        name: "Neon Pulse",
        artist: "Future Beat",
        url: "https://open.spotify.com/track/71378126",
        imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3"
      },
      {
        id: "neon-pulse-mock-2",
        name: "Acid Overdrive",
        artist: "Future Beat",
        url: "https://open.spotify.com/track/71378127",
        imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3"
      },
      {
        id: "neon-pulse-mock-3",
        name: "Digital Storm",
        artist: "Cyberpunk",
        url: "https://open.spotify.com/track/71378128",
        imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"
      },
      {
        id: "neon-pulse-mock-4",
        name: "Voltage Spike",
        artist: "Voltage",
        url: "https://open.spotify.com/track/71378129",
        imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3"
      },
      {
        id: "neon-pulse-mock-5",
        name: "Static Frequency",
        artist: "Signal",
        url: "https://open.spotify.com/track/71378130",
        imageUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3"
      }
    ]
  },
  {
    id: "lofi-cityscape",
    name: "Low-Fi Cityscape",
    description: "Relaxing beats and atmospheric background noise for coding.",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
    tracks: [
      {
        id: "lofi-cityscape-mock-1",
        name: "Low-Fi Cityscape",
        artist: "Beatmaker",
        url: "https://open.spotify.com/track/71378131",
        imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3"
      },
      {
        id: "lofi-cityscape-mock-2",
        name: "Rainy Cafe Beats",
        artist: "Chillhop",
        url: "https://open.spotify.com/track/71378132",
        imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3"
      },
      {
        id: "lofi-cityscape-mock-3",
        name: "Midnight Coffee",
        artist: "Beatmaker",
        url: "https://open.spotify.com/track/71378133",
        imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3"
      },
      {
        id: "lofi-cityscape-mock-4",
        name: "Sleepy Streets",
        artist: "Lofi Kid",
        url: "https://open.spotify.com/track/71378134",
        imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3"
      },
      {
        id: "lofi-cityscape-mock-5",
        name: "Warm Blanket",
        artist: "Sleepy",
        url: "https://open.spotify.com/track/71378135",
        imageUrl: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=100&q=80",
        previewUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3"
      }
    ]
  }
];
