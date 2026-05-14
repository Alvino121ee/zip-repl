import { logger } from "../lib/logger.js";
import { cache, TTL } from "./cache.js";

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  source: string;
  publishedAt: string;
  categories: string[];
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  tags: string[];
}

const POSITIVE_WORDS = [
  "surge", "rally", "gain", "rise", "bull", "breakout", "growth", "profit",
  "adoption", "record", "milestone", "partnership", "upgrade", "launch",
  "approval", "bullish", "soar", "climb", "increase", "positive", "strong",
  "opportunity", "innovation", "success", "beat", "exceed", "jump",
  "naik", "meningkat", "pertumbuhan", "untung", "bullish", "optimis",
  "menguat", "kenaikan", "positif", "cerah", "bagus", "rebound", "outperform",
];

const NEGATIVE_WORDS = [
  "crash", "plunge", "drop", "fall", "bear", "loss", "decline", "sell",
  "hack", "fraud", "ban", "regulatory", "lawsuit", "fear", "panic", "dump",
  "warning", "risk", "uncertain", "volatile", "down", "weak", "collapse",
  "bearish", "concern", "threat", "violation", "investigation", "delay",
  "turun", "anjlok", "jatuh", "rugi", "bearish", "pesimis", "larangan",
  "tertekan", "melemah", "koreksi", "negatif", "buruk", "underperform",
];

export function analyzeSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of POSITIVE_WORDS) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) score -= 1;
  }
  const normalized = Math.max(-1, Math.min(1, score / 5));
  const sentiment = normalized > 0.1 ? "positive" : normalized < -0.1 ? "negative" : "neutral";
  return { sentiment, score: normalized };
}

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: "idx1",
    title: "BBCA Catat Laba Bersih Rp 14,8 Triliun di Q1 2026, Tumbuh 11% YoY",
    body: "Bank Central Asia (BBCA) membukukan laba bersih sebesar Rp 14,8 triliun pada kuartal pertama 2026, tumbuh 11% year-on-year. Pertumbuhan didorong oleh ekspansi kredit yang sehat dan peningkatan pendapatan bunga bersih. Analis mempertahankan rekomendasi beli dengan target harga Rp 10.500.",
    url: "https://kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=200&fit=crop",
    source: "Kontan",
    publishedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "banking"],
    sentiment: "positive",
    sentimentScore: 0.75,
    tags: ["BBCA", "perbankan", "laba", "BEI"],
  },
  {
    id: "idx2",
    title: "IHSG Menguat 1,2% Dipimpin Sektor Keuangan dan Energi",
    body: "Indeks Harga Saham Gabungan (IHSG) ditutup menguat 1,2% ke level 7.485 pada perdagangan hari ini. Saham-saham sektor keuangan dan energi menjadi penopang utama indeks. Volume perdagangan mencapai Rp 12,5 triliun, di atas rata-rata 20 hari.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "ihsg"],
    sentiment: "positive",
    sentimentScore: 0.65,
    tags: ["IHSG", "BEI", "indeks", "saham"],
  },
  {
    id: "idx3",
    title: "GoTo (GOTO) Umumkan Profitabilitas EBITDA Adjusted Positif untuk Pertama Kalinya",
    body: "GoTo Gojek Tokopedia (GOTO) mengumumkan pencapaian historis dengan membukukan EBITDA adjusted yang positif untuk pertama kalinya sejak IPO. Manajemen menyebut efisiensi biaya dan pertumbuhan GTV sebagai pendorong utama. Saham GOTO melonjak 7% dalam sesi perdagangan.",
    url: "https://cnbcindonesia.com",
    imageUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=200&fit=crop",
    source: "CNBC Indonesia",
    publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "tech"],
    sentiment: "positive",
    sentimentScore: 0.80,
    tags: ["GOTO", "profitabilitas", "teknologi", "BEI"],
  },
  {
    id: "idx4",
    title: "Bank Indonesia Tahan Suku Bunga di 5,75%, Dukung Stabilitas Rupiah",
    body: "Rapat Dewan Gubernur Bank Indonesia memutuskan untuk mempertahankan suku bunga acuan BI Rate di level 5,75%. Keputusan ini dinilai positif bagi sektor perbankan dan diharapkan menjaga stabilitas nilai tukar rupiah terhadap dolar AS.",
    url: "https://detik.com",
    imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop",
    source: "Detik Finance",
    publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "macro"],
    sentiment: "positive",
    sentimentScore: 0.45,
    tags: ["BI Rate", "Bank Indonesia", "suku bunga", "perbankan"],
  },
  {
    id: "idx5",
    title: "ANTM (Aneka Tambang) Menguat 3% Didorong Kenaikan Harga Emas dan Nikel Global",
    body: "Saham Aneka Tambang (ANTM) menguat 3% menyusul kenaikan harga emas ke level USD 2.380/troy ons dan pemulihan harga nikel di pasar internasional. Analis memperkirakan kinerja ANTM akan terus membaik sepanjang 2026 seiring permintaan baterai kendaraan listrik.",
    url: "https://kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1624996379697-f01d168b1a52?w=400&h=200&fit=crop",
    source: "Kontan",
    publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "mining"],
    sentiment: "positive",
    sentimentScore: 0.70,
    tags: ["ANTM", "emas", "nikel", "tambang", "BEI"],
  },
  {
    id: "idx6",
    title: "Telkom (TLKM) Akselerasi Transformasi Digital, IndiHome Tambah 500 Ribu Pelanggan",
    body: "Telkom Indonesia (TLKM) melaporkan penambahan 500 ribu pelanggan IndiHome dalam satu kuartal, memperkuat posisi sebagai pemain broadband terbesar di Indonesia. Segmen B2B digital cloud juga tumbuh 28% YoY, mendorong optimisme investor.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "telecom"],
    sentiment: "positive",
    sentimentScore: 0.60,
    tags: ["TLKM", "Telkom", "digital", "broadband"],
  },
  {
    id: "idx7",
    title: "OJK Luncurkan Roadmap Pasar Modal 2025-2029, Targetkan 20 Juta Investor",
    body: "Otoritas Jasa Keuangan (OJK) resmi meluncurkan Roadmap Pengembangan dan Penguatan Pasar Modal Indonesia 2025-2029 dengan target menambah 20 juta investor baru. Program literasi keuangan dan digitalisasi bursa menjadi pilar utama rencana ini.",
    url: "https://cnbcindonesia.com",
    imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=200&fit=crop",
    source: "CNBC Indonesia",
    publishedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "regulation"],
    sentiment: "positive",
    sentimentScore: 0.50,
    tags: ["OJK", "pasar modal", "investor", "regulasi"],
  },
  {
    id: "idx8",
    title: "ADRO Tertekan Koreksi Harga Batu Bara, Saham Turun 2,5%",
    body: "Saham Adaro Energy (ADRO) terkoreksi 2,5% menyusul pelemahan harga batu bara acuan Newcastle ke USD 118/ton. Penurunan permintaan dari China menjadi faktor utama tekanan harga. Analis menyarankan wait and see untuk saham-saham batu bara jangka pendek.",
    url: "https://investasi.kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=400&h=200&fit=crop",
    source: "Kontan Investasi",
    publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "energy"],
    sentiment: "negative",
    sentimentScore: -0.50,
    tags: ["ADRO", "batu bara", "energi", "koreksi"],
  },
  {
    id: "idx9",
    title: "BBRI Perkuat Portofolio UMKM Digital, Bidik 30 Juta Nasabah Aktif",
    body: "Bank Rakyat Indonesia (BBRI) memperkuat ekosistem digital untuk UMKM melalui platform BRImo yang kini memiliki 35 juta pengguna aktif. Perseroan menargetkan penyaluran kredit UMKM sebesar Rp 1.200 triliun pada 2026.",
    url: "https://katadata.co.id",
    imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=200&fit=crop",
    source: "Katadata",
    publishedAt: new Date(Date.now() - 9 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "banking"],
    sentiment: "positive",
    sentimentScore: 0.62,
    tags: ["BBRI", "UMKM", "digital", "perbankan"],
  },
  {
    id: "idx10",
    title: "Astra International (ASII) Jual 20% Saham Perseroan ke Investor Strategis",
    body: "Astra International (ASII) mengumumkan rencana penjualan 20% saham anak usaha otomotif kepada investor strategis dari Jepang. Langkah ini diperkirakan akan mendatangkan dana segar Rp 8 triliun untuk ekspansi bisnis kendaraan listrik.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "automotive"],
    sentiment: "positive",
    sentimentScore: 0.55,
    tags: ["ASII", "Astra", "otomotif", "EV", "investasi"],
  },
  {
    id: "idx11",
    title: "Rupiah Menguat ke Rp 15.850/USD, IHSG Ikut Terdongkrak",
    body: "Nilai tukar rupiah menguat ke Rp 15.850 per dolar AS, level terkuat dalam tiga bulan terakhir. Penguatan rupiah turut mendorong optimisme investor di pasar saham domestik, dengan IHSG menguat 0,8% di awal sesi perdagangan.",
    url: "https://detik.com",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Detik Finance",
    publishedAt: new Date(Date.now() - 11 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "macro"],
    sentiment: "positive",
    sentimentScore: 0.48,
    tags: ["Rupiah", "IHSG", "forex", "makro"],
  },
  {
    id: "idx12",
    title: "Indosat (ISAT) Merger Sukses: Pangsa Pasar Naik ke 35%, Target 100 Juta Pelanggan",
    body: "Pasca merger dengan Tri Indonesia, Indosat Ooredoo Hutchison (ISAT) berhasil meningkatkan pangsa pasar menjadi 35% dan kini menargetkan 100 juta pelanggan pada akhir 2026. Efisiensi jaringan dan produk bundling menjadi kunci pertumbuhan.",
    url: "https://cnbcindonesia.com",
    imageUrl: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=200&fit=crop",
    source: "CNBC Indonesia",
    publishedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "telecom"],
    sentiment: "positive",
    sentimentScore: 0.70,
    tags: ["ISAT", "Indosat", "merger", "telekomunikasi"],
  },
  {
    id: "idx13",
    title: "Saham Batu Bara RI Kompak Melemah Ikuti Harga Global yang Turun",
    body: "Saham-saham batu bara di BEI seperti PTBA, ADRO, dan INDY kompak melemah mengikuti tren penurunan harga batu bara global. Permintaan dari Eropa yang melambat dan pasokan dari Australia yang meningkat menekan harga acuan.",
    url: "https://investasi.kontan.co.id",
    imageUrl: "https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=400&h=200&fit=crop",
    source: "Kontan Investasi",
    publishedAt: new Date(Date.now() - 13 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "energy"],
    sentiment: "negative",
    sentimentScore: -0.45,
    tags: ["PTBA", "ADRO", "batu bara", "energi"],
  },
  {
    id: "idx14",
    title: "Kalbe Farma (KLBF) Ekspansi ke Pasar ASEAN, Target Ekspor Naik 25%",
    body: "Kalbe Farma (KLBF) mengumumkan ekspansi ke pasar farmasi ASEAN dengan menargetkan peningkatan ekspor sebesar 25% pada 2026. Produk-produk unggulan Kalbe sudah tersedia di 10 negara ASEAN dan mulai merambah pasar India.",
    url: "https://katadata.co.id",
    imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=200&fit=crop",
    source: "Katadata",
    publishedAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "healthcare"],
    sentiment: "positive",
    sentimentScore: 0.58,
    tags: ["KLBF", "farmasi", "ekspor", "ASEAN"],
  },
  {
    id: "idx15",
    title: "Prospek IHSG 2026: Analis Targetkan Level 8.000 Akhir Tahun",
    body: "Sejumlah analis pasar modal memproyeksikan IHSG dapat mencapai level 8.000 pada akhir 2026, didukung perbaikan ekonomi domestik, inflasi terkendali, dan masuknya investor asing. Sektor konsumer, perbankan, dan energi terbarukan menjadi pilihan utama.",
    url: "https://bisnis.com",
    imageUrl: "https://images.unsplash.com/photo-1560472355-536de3962603?w=400&h=200&fit=crop",
    source: "Bisnis Indonesia",
    publishedAt: new Date(Date.now() - 16 * 3600000).toISOString(),
    categories: ["stocks", "indonesia", "ihsg"],
    sentiment: "positive",
    sentimentScore: 0.55,
    tags: ["IHSG", "proyeksi", "analis", "2026"],
  },
  // Crypto news
  {
    id: "crypt1",
    title: "Bitcoin Tembus $96.000, Dominasi Pasar Kripto Mencapai 60%",
    body: "Bitcoin kembali menguji resistance $96.000 setelah arus masuk ke ETF Bitcoin spot mencapai $850 juta dalam sepekan. Dominasi BTC di pasar kripto global naik ke 60%, menunjukkan kepercayaan investor institusional yang semakin kuat.",
    url: "https://coindesk.com",
    imageUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=400&h=200&fit=crop",
    source: "CoinDesk",
    publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    categories: ["crypto", "bitcoin"],
    sentiment: "positive",
    sentimentScore: 0.75,
    tags: ["BTC", "bitcoin", "ETF", "institutional"],
  },
  {
    id: "crypt2",
    title: "Ethereum Upgrade Pectra Berhasil: Gas Fee Turun 40%, Transaksi Melonjak",
    body: "Upgrade Pectra di jaringan Ethereum berhasil diimplementasikan, menghasilkan penurunan biaya gas rata-rata 40% dan peningkatan throughput transaksi. DeFi dan NFT di Ethereum kembali bergairah dengan TVL mendekati $65 miliar.",
    url: "https://cointelegraph.com",
    imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
    source: "CoinTelegraph",
    publishedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    categories: ["crypto", "ethereum"],
    sentiment: "positive",
    sentimentScore: 0.80,
    tags: ["ETH", "ethereum", "upgrade", "DeFi"],
  },
  {
    id: "crypt3",
    title: "OJK Terbitkan Aturan Baru Aset Kripto, Pedagang Wajib Daftar Ulang",
    body: "OJK menerbitkan regulasi baru terkait perdagangan aset kripto di Indonesia yang mewajibkan seluruh pedagang untuk mendaftar ulang dan memenuhi persyaratan modal minimum. Analis menilai regulasi ini akan meningkatkan kepercayaan investor jangka panjang.",
    url: "https://coinmarketcap.com",
    imageUrl: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop",
    source: "CoinMarketCap",
    publishedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    categories: ["crypto", "regulation", "indonesia"],
    sentiment: "neutral",
    sentimentScore: 0.1,
    tags: ["OJK", "regulasi", "kripto", "Indonesia"],
  },
  {
    id: "crypt4",
    title: "Solana Catat Rekor Volume DEX $8 Miliar dalam 24 Jam",
    body: "Solana mencatat rekor volume perdagangan DEX sebesar $8 miliar dalam 24 jam, melampaui Ethereum untuk pertama kalinya. Ekosistem meme coin dan gaming di Solana menjadi pendorong utama lonjakan volume.",
    url: "https://decrypt.co",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    source: "Decrypt",
    publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    categories: ["crypto", "solana", "defi"],
    sentiment: "positive",
    sentimentScore: 0.72,
    tags: ["SOL", "solana", "DEX", "DeFi"],
  },
  {
    id: "crypt5",
    title: "Pasar Kripto Terkoreksi Jelang Data Inflasi AS, Bitcoin Turun ke $91.000",
    body: "Pasar kripto mengalami koreksi menjelang rilis data inflasi AS (CPI). Bitcoin turun ke $91.000, sementara altcoin mengalami penurunan lebih dalam hingga 8-12%. Analis menyebut ini sebagai koreksi sehat sebelum kelanjutan tren bullish.",
    url: "https://reuters.com",
    imageUrl: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=400&h=200&fit=crop",
    source: "Reuters",
    publishedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
    categories: ["crypto", "macro"],
    sentiment: "negative",
    sentimentScore: -0.40,
    tags: ["BTC", "kripto", "koreksi", "inflasi", "Fed"],
  },
];

export async function getCryptoNews(limit: number): Promise<NewsItem[]> {
  const cacheKey = `news-crypto-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  const result = FALLBACK_NEWS.filter((n) => n.categories.includes("crypto")).slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}

export async function getStockNews(limit: number): Promise<NewsItem[]> {
  const cacheKey = `news-stock-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  const result = FALLBACK_NEWS.filter((n) => n.categories.includes("stocks")).slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}

export async function getAllNews(limit: number, type?: string): Promise<NewsItem[]> {
  const cacheKey = `news-all-${type}-${limit}`;
  const cached = cache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  let filtered = FALLBACK_NEWS;
  if (type === "crypto") {
    filtered = FALLBACK_NEWS.filter((n) => n.categories.includes("crypto"));
  } else if (type === "stock") {
    filtered = FALLBACK_NEWS.filter((n) => n.categories.includes("stocks"));
  }

  const result = filtered.slice(0, limit);
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}

// Re-export for legacy usage
export { logger };
