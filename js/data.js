// BeatMarket — Beat Catalog Data
// Live data is fetched from Supabase (js/api.js).
// BEATS below are demo/sample beats shown when Supabase returns empty.

const BEATS = [
  {
    id: "demo-1",
    title: "Midnight Drive",
    producer: "Olaniyi",
    producerId: "demo-p1",
    genre: "Trap",
    bpm: 140,
    key: "C Minor",
    price: 29.99,
    cover: "assets/covers/midnight_drive.png",
    audio: null,
    tags: ["Dark", "Cinematic", "Hard"],
    plays: 12400,
    likes: 842,
    status: "active",
    featured: true,
  },
  {
    id: "demo-2",
    title: "Inferno",
    producer: "Lanzy",
    producerId: "demo-p2",
    genre: "Drill",
    bpm: 145,
    key: "F# Minor",
    price: 34.99,
    cover: "assets/covers/inferno.png",
    audio: null,
    tags: ["Fire", "UK Drill", "Aggressive"],
    plays: 9800,
    likes: 631,
    status: "active",
    featured: true,
  },
  {
    id: "demo-3",
    title: "Lo-Fi City",
    producer: "Terry B",
    producerId: "demo-p3",
    genre: "Lo-Fi",
    bpm: 85,
    key: "G Major",
    price: 19.99,
    cover: "assets/covers/lofi_city.png",
    audio: null,
    tags: ["Chill", "Study", "Mellow"],
    plays: 21000,
    likes: 1540,
    status: "active",
    featured: false,
  },
  {
    id: "demo-4",
    title: "Afrowave",
    producer: "Olaniyi",
    producerId: "demo-p1",
    genre: "Afrobeats",
    bpm: 112,
    key: "A Major",
    price: 39.99,
    cover: "assets/covers/afrobeats.png",
    audio: null,
    tags: ["Afrobeats", "Dance", "Vibes"],
    plays: 18700,
    likes: 1230,
    status: "active",
    featured: true,
  },
  {
    id: "demo-5",
    title: "Velvet R&B",
    producer: "Pro",
    producerId: "demo-p4",
    genre: "R&B",
    bpm: 78,
    key: "D Minor",
    price: 44.99,
    cover: "assets/covers/rnb.png",
    audio: null,
    tags: ["Smooth", "Soul", "Romantic"],
    plays: 7300,
    likes: 389,
    status: "active",
    featured: false,
  },
  {
    id: "demo-6",
    title: "Rage Mode",
    producer: "Lanzy",
    producerId: "demo-p2",
    genre: "Rage",
    bpm: 160,
    key: "B Minor",
    price: 29.99,
    cover: "assets/covers/rage.png",
    audio: null,
    tags: ["Rage", "Plug", "Hard"],
    plays: 15200,
    likes: 975,
    status: "active",
    featured: false,
  },
];

const PRODUCERS = [
  { id: "demo-p1", name: "Olaniyi", handle: "olaniyi", role: "seller", status: "active", beat_count: 3 },
  { id: "demo-p2", name: "Lanzy",   handle: "lanzy",   role: "seller", status: "active", beat_count: 2 },
  { id: "demo-p3", name: "Terry B", handle: "terryb",  role: "seller", status: "active", beat_count: 1 },
  { id: "demo-p4", name: "Pro",     handle: "pro",     role: "seller", status: "active", beat_count: 1 },
];


// ── License definitions (product config, not demo data) ────────────
const LICENSES = [
  {
    id: "basic",
    name: "Basic MP3",
    icon: "🎵",
    multiplier: 1,
    features: [
      "MP3 File (320kbps)",
      "Up to 50,000 streams",
      "Non-profit use",
      "Credit required",
    ],
    color: "#6B7280",
  },
  {
    id: "premium",
    name: "Premium WAV",
    icon: "🎶",
    multiplier: 2,
    features: [
      "WAV + MP3 Files",
      "Up to 500,000 Streams",
      "Monetize on platforms",
      "Credit required",
    ],
    color: "#7C3AED",
    popular: true,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    icon: "⚡",
    multiplier: 4,
    features: [
      "WAV + MP3 + Stems",
      "Unlimited Streams",
      "Full monetization",
      "No credit required",
    ],
    color: "#059669",
  },
  {
    id: "exclusive",
    name: "Exclusive Rights",
    icon: "👑",
    multiplier: 12,
    features: [
      "All File Formats + Stems",
      "Exclusive ownership",
      "Beat removed from store",
      "Full copyright transfer",
    ],
    color: "#D97706",
  },
];

const GENRES = ["All", "Trap", "Drill", "Lo-Fi", "Rage", "Afrobeats", "R&B", "Pop", "Other"];

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}
