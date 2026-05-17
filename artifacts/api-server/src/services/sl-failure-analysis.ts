/**
 * Stop Loss Failure Analysis System
 *
 * Setiap kali trade kena Stop Loss:
 * - Analisis mendalam sebab kegagalan
 * - Deteksi pola berulang
 * - Generate kesimpulan & rekomendasi AI
 * - Integrasikan pembelajaran ke ai-brain
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const SL_ANALYSIS_FILE = join(DATA_DIR, "sl-failure-analysis.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailureCause =
  | "wrong_trend"
  | "fake_breakout"
  | "weak_momentum"
  | "low_volume"
  | "late_entry"
  | "early_entry"
  | "incorrect_sl_placement"
  | "market_manipulation"
  | "liquidity_sweep_trap"
  | "volatility_spike"
  | "news_impact"
  | "choppy_market"
  | "weak_orderflow"
  | "poor_risk_reward"
  | "mtf_conflict"
  | "overconfidence"
  | "low_quality_setup"
  | "unknown";

export const FAILURE_CAUSE_LABELS: Record<FailureCause, string> = {
  wrong_trend: "Deteksi Tren Salah",
  fake_breakout: "Fake Breakout",
  weak_momentum: "Momentum Lemah",
  low_volume: "Volume Konfirmasi Rendah",
  late_entry: "Entry Terlambat",
  early_entry: "Entry Terlalu Cepat",
  incorrect_sl_placement: "Penempatan SL Tidak Tepat",
  market_manipulation: "Manipulasi Pasar",
  liquidity_sweep_trap: "Liquidity Sweep Trap",
  volatility_spike: "Volatilitas Tinggi / Spike",
  news_impact: "Dampak Berita / News",
  choppy_market: "Pasar Choppy / Sideways",
  weak_orderflow: "Orderflow Lemah",
  poor_risk_reward: "Risk/Reward Buruk",
  mtf_conflict: "Konflik Multi-Timeframe",
  overconfidence: "Overconfidence AI",
  low_quality_setup: "Setup Kualitas Rendah",
  unknown: "Penyebab Tidak Diketahui",
};

export const FAILURE_CAUSE_ICONS: Record<FailureCause, string> = {
  wrong_trend: "📉",
  fake_breakout: "🎭",
  weak_momentum: "⚡",
  low_volume: "📊",
  late_entry: "⏰",
  early_entry: "🏃",
  incorrect_sl_placement: "🎯",
  market_manipulation: "🐋",
  liquidity_sweep_trap: "🪤",
  volatility_spike: "💥",
  news_impact: "📰",
  choppy_market: "🌊",
  weak_orderflow: "🔄",
  poor_risk_reward: "⚖️",
  mtf_conflict: "🕐",
  overconfidence: "😤",
  low_quality_setup: "⬇️",
  unknown: "❓",
};

export interface SLAnalysisInput {
  tradeId: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  slPrice: number;
  exitPrice: number;
  pnlPct: number;
  confidence: number;
  strategy?: string;
  marketCondition?: string;
  holdTimeMs: number;
  // Optional indicator context
  volumeRatio?: number;    // volume vs 20-bar average (>1.5 = high, <0.8 = low)
  rsiAtEntry?: number;     // RSI at entry
  priceChangePct24h?: number; // 24h price change
  orderflowBias?: "bullish" | "bearish" | "neutral";
  liquiditySweepDetected?: boolean;
  isChoppy?: boolean;
  momentumStrength?: number; // 0-100
  weightedConfidence?: number;
}

export interface SLFailureRecord {
  id: string;
  timestamp: number;
  tradeId: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  slPrice: number;
  exitPrice: number;
  pnlPct: number;
  confidence: number;
  strategy: string;
  marketCondition: string;
  holdTimeMs: number;
  primaryCause: FailureCause;
  secondaryCauses: FailureCause[];
  conclusion: string;
  recommendations: string[];
  severity: "minor" | "moderate" | "major";
  slTightnessPct: number;  // how tight was the SL as % of entry
  improvementApplied: boolean;
}

export interface FailurePattern {
  id: string;
  pattern: string;
  description: string;
  occurrences: number;
  primaryCause: FailureCause;
  associatedStrategies: string[];
  associatedConditions: string[];
  avgPnlPct: number;
  recommendation: string;
  severity: "low" | "medium" | "high" | "critical";
  firstSeen: number;
  lastSeen: number;
}

export interface SLAnalyticsStats {
  totalStopLosses: number;
  causeCounts: Partial<Record<FailureCause, number>>;
  worstStrategies: { strategy: string; slCount: number; avgPnlPct: number }[];
  worstConditions: { condition: string; slCount: number }[];
  mostCommonCauses: { cause: FailureCause; label: string; count: number; pct: number }[];
  patterns: FailurePattern[];
  improvementScore: number;
  recentAnalyses: SLFailureRecord[];
  severityBreakdown: { minor: number; moderate: number; major: number };
  avgHoldTimeMs: number;
  avgConfidenceOnSL: number;
  overconfidenceRate: number; // % of SL trades where confidence was >= 80
}

// ─── Persistent State ─────────────────────────────────────────────────────────

interface SLState {
  records: SLFailureRecord[];
  patterns: FailurePattern[];
  avoidanceRules: { cause: FailureCause; addedAt: number; count: number }[];
  totalAnalyzed: number;
  improvementScore: number;
}

let slState: SLState = {
  records: [],
  patterns: [],
  avoidanceRules: [],
  totalAnalyzed: 0,
  improvementScore: 50,
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function saveSLState() {
  try {
    ensureDataDir();
    writeFileSync(SL_ANALYSIS_FILE, JSON.stringify(slState, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Failed to save SL analysis state");
  }
}

function loadSLState() {
  try {
    ensureDataDir();
    if (!existsSync(SL_ANALYSIS_FILE)) return;
    const saved = JSON.parse(readFileSync(SL_ANALYSIS_FILE, "utf-8")) as SLState;
    slState = {
      records: Array.isArray(saved.records) ? saved.records : [],
      patterns: Array.isArray(saved.patterns) ? saved.patterns : [],
      avoidanceRules: Array.isArray(saved.avoidanceRules) ? saved.avoidanceRules : [],
      totalAnalyzed: saved.totalAnalyzed ?? 0,
      improvementScore: saved.improvementScore ?? 50,
    };
    logger.info({ total: slState.records.length }, "SL failure analysis loaded");
  } catch (err) {
    logger.warn({ err }, "Failed to load SL analysis state");
  }
}

loadSLState();

// ─── Failure Detection Heuristics ─────────────────────────────────────────────

function detectFailureCauses(input: SLAnalysisInput): {
  primary: FailureCause;
  secondary: FailureCause[];
  severity: SLFailureRecord["severity"];
} {
  const causes: { cause: FailureCause; score: number }[] = [];

  const {
    side, confidence, marketCondition, holdTimeMs, volumeRatio,
    rsiAtEntry, priceChangePct24h, orderflowBias, liquiditySweepDetected,
    isChoppy, momentumStrength, pnlPct, slPrice, entryPrice, strategy,
  } = input;

  const slTightPct = Math.abs((slPrice - entryPrice) / entryPrice * 100);
  const isLong = side === "long";
  const condLower = (marketCondition ?? "").toLowerCase();

  // 1. Wrong trend detection
  const wrongTrendCondition =
    (isLong && (condLower.includes("bearish") || condLower.includes("trending_down"))) ||
    (!isLong && (condLower.includes("bullish") || condLower.includes("trending_up")));
  if (wrongTrendCondition) causes.push({ cause: "wrong_trend", score: 90 });

  // 2. Fake breakout — hit SL fast + price reversed
  if (holdTimeMs < 5 * 60_000 && Math.abs(pnlPct) > 0.5) {
    causes.push({ cause: "fake_breakout", score: 80 });
  }

  // 3. Choppy/sideways market
  if (isChoppy || condLower.includes("choppy") || condLower.includes("sideways")) {
    causes.push({ cause: "choppy_market", score: 85 });
  }

  // 4. Liquidity sweep trap
  if (liquiditySweepDetected) {
    causes.push({ cause: "liquidity_sweep_trap", score: 88 });
  }

  // 5. Market manipulation
  if (condLower.includes("manipulation") || (holdTimeMs < 3 * 60_000 && Math.abs(pnlPct) > 0.8)) {
    causes.push({ cause: "market_manipulation", score: 82 });
  }

  // 6. Weak momentum
  if (momentumStrength !== undefined && momentumStrength < 35) {
    causes.push({ cause: "weak_momentum", score: 75 });
  } else if (rsiAtEntry !== undefined) {
    const rsiNeutralZone = rsiAtEntry >= 44 && rsiAtEntry <= 56;
    if (rsiNeutralZone) causes.push({ cause: "weak_momentum", score: 70 });
  }

  // 7. Low volume
  if (volumeRatio !== undefined && volumeRatio < 0.9) {
    causes.push({ cause: "low_volume", score: 72 });
  }

  // 8. Wrong orderflow
  if (orderflowBias !== undefined && orderflowBias !== "neutral") {
    const conflictingOrderflow =
      (isLong && orderflowBias === "bearish") || (!isLong && orderflowBias === "bullish");
    if (conflictingOrderflow) causes.push({ cause: "weak_orderflow", score: 78 });
  }

  // 9. Volatility spike
  if (priceChangePct24h !== undefined && Math.abs(priceChangePct24h) > 8) {
    causes.push({ cause: "volatility_spike", score: 70 });
  }

  // 10. Early entry — hit SL extremely fast (< 2 min)
  if (holdTimeMs < 2 * 60_000) {
    causes.push({ cause: "early_entry", score: 77 });
  }

  // 11. Late entry — hit SL after long hold but still lost
  if (holdTimeMs > 60 * 60_000 && Math.abs(pnlPct) > 0.5) {
    causes.push({ cause: "late_entry", score: 65 });
  }

  // 12. Incorrect SL placement — SL was unreasonably tight
  if (slTightPct < 0.4) {
    causes.push({ cause: "incorrect_sl_placement", score: 73 });
  }

  // 13. Poor risk/reward — entered with low confidence
  if (confidence < 70) {
    causes.push({ cause: "poor_risk_reward", score: 68 });
    causes.push({ cause: "low_quality_setup", score: 65 });
  }

  // 14. Overconfidence — high confidence but still lost
  if (confidence >= 85) {
    causes.push({ cause: "overconfidence", score: 60 });
  }

  // 15. MTF conflict — strategy suggest possible timeframe issue
  if (strategy?.includes("5m") || strategy?.includes("scalp")) {
    if (condLower.includes("trending") || priceChangePct24h !== undefined && Math.abs(priceChangePct24h) < 2) {
      causes.push({ cause: "mtf_conflict", score: 55 });
    }
  }

  // 16. Default fallback
  if (causes.length === 0) {
    causes.push({ cause: "unknown", score: 40 });
  }

  // Sort by score
  causes.sort((a, b) => b.score - a.score);

  const primary = causes[0].cause;
  const secondary = causes.slice(1, 4).map(c => c.cause);

  // Severity
  const severity: SLFailureRecord["severity"] =
    causes[0].score >= 85 ? "major" :
    causes[0].score >= 70 ? "moderate" : "minor";

  return { primary, secondary, severity };
}

// ─── Conclusion Generator ─────────────────────────────────────────────────────

const CAUSE_CONCLUSIONS: Record<FailureCause, string[]> = {
  wrong_trend: [
    "Trade gagal karena AI masuk berlawanan dengan tren utama pasar.",
    "Deteksi tren tidak akurat — harga bergerak melawan posisi karena tren dominan berbeda.",
    "Kesalahan identifikasi arah tren menyebabkan posisi langsung berlawanan dengan arus pasar.",
  ],
  fake_breakout: [
    "Fake breakout terdeteksi — harga menembus level kunci lalu berbalik arah dengan cepat.",
    "Entry setelah breakout yang ternyata palsu. Harga kembali ke dalam range sebelum SL terevisi.",
    "Breakout tidak valid — volume tidak mendukung pergerakan harga yang tampak kuat.",
  ],
  weak_momentum: [
    "Momentum melemah sebelum atau saat eksekusi entry, menyebabkan pergerakan harga stagnan.",
    "RSI berada di zona netral saat entry — konfirmasi momentum tidak cukup kuat.",
    "Kekuatan tren tidak memadai untuk mendukung posisi hingga target profit.",
  ],
  low_volume: [
    "Volume konfirmasi terlalu rendah — pergerakan harga tidak didukung partisipasi market yang cukup.",
    "Entry dalam kondisi volume tipis meningkatkan risiko pergerakan palsu dan reversal mendadak.",
    "Likuiditas tidak mencukupi untuk mempertahankan arah tren yang diharapkan.",
  ],
  late_entry: [
    "Entry terlambat — momentum sudah habis saat posisi dibuka, reversal terjadi segera setelah.",
    "Harga sudah bergerak signifikan sebelum entry, menyisakan ruang gerak minimal untuk profit.",
    "Setup valid namun eksekusi terlambat, posisi masuk dekat titik balik.",
  ],
  early_entry: [
    "Entry terlalu cepat sebelum konfirmasi tren selesai — pasar belum siap bergerak dalam arah entry.",
    "Sinyal belum terkonfirmasi penuh saat posisi dibuka; harga masih dalam fase konsolidasi.",
    "AI masuk terlalu dini, sebelum breakout atau reversal mendapat konfirmasi valid.",
  ],
  incorrect_sl_placement: [
    "Stop Loss terlalu ketat untuk kondisi volatilitas saat itu — kena SL oleh noise pasar biasa.",
    "Penempatan SL tidak mempertimbangkan ATR atau level support/resistance terdekat.",
    "SL berada di dalam jangkauan volatilitas normal, menyebabkan tersentuh tanpa alasan teknikal.",
  ],
  market_manipulation: [
    "Pasar memasuki fase manipulasi setelah entry — pergerakan harga tidak organik.",
    "Aktivitas whale atau market maker menyebabkan harga bergerak berlawanan secara mendadak.",
    "Stop hunt terdeteksi — harga diarahkan untuk menyentuh SL sebelum melanjutkan tren asli.",
  ],
  liquidity_sweep_trap: [
    "Liquidity sweep trap — harga menyapu area SL untuk mengumpulkan likuiditas sebelum reversal.",
    "AI terjebak dalam liquidity hunt; institusi mendorong harga ke zona SL lalu berbalik arah.",
    "Entry dilakukan tepat sebelum sweep likuiditas yang mengaktifkan SL massal.",
  ],
  volatility_spike: [
    "Spike volatilitas ekstrem menyebabkan candle besar yang menyentuh SL dalam hitungan menit.",
    "Kondisi volatilitas tinggi membuat jarak SL normal tidak memadai untuk menahan fluktuasi.",
    "Pergerakan harga tiba-tiba melebihi ekspektasi normal karena volatilitas pasar yang meningkat tajam.",
  ],
  news_impact: [
    "Berita atau event makroekonomi menyebabkan pergerakan harga tiba-tiba yang melampaui SL.",
    "Dampak berita tidak diperhitungkan dalam analisis — harga bereaksi di luar parameter teknikal.",
    "Event fundamental mendominasi sinyal teknikal, menyebabkan pergerakan tak terprediksi.",
  ],
  choppy_market: [
    "Pasar dalam kondisi choppy/sideways — tidak ada tren jelas dan pergerakan acak.",
    "Kondisi ranging menyebabkan sinyal buy dan sell bergantian tanpa arah yang konsisten.",
    "AI masuk saat pasar tidak memiliki arah, menghasilkan trade yang terjebak dalam noise.",
  ],
  weak_orderflow: [
    "Orderflow tidak mengkonfirmasi arah entry — tekanan beli/jual tidak mendukung posisi.",
    "Analisis orderflow menunjukkan bias berlawanan dengan arah trade yang diambil.",
    "Distribusi order tidak selaras dengan arah entry, memberi sinyal lemah untuk eksekusi.",
  ],
  poor_risk_reward: [
    "Rasio risk/reward tidak optimal — SL terlalu dekat relatif terhadap target profit.",
    "Setup dengan R:R buruk tidak memberikan ruang cukup untuk trade berkembang sebelum reversal kecil.",
    "Trade dibuka dengan confidence rendah tanpa kompensasi R:R yang memadai.",
  ],
  mtf_conflict: [
    "Tren timeframe yang lebih tinggi bertentangan dengan sinyal entry di timeframe yang lebih rendah.",
    "Konflik multi-timeframe — sinyal 5m valid namun bertentangan dengan arah utama di 1H/4H.",
    "Entry searah dengan sinyal minor namun berlawanan dengan tren mayor.",
  ],
  overconfidence: [
    "AI overconfident — confidence tinggi tidak mencerminkan kompleksitas kondisi pasar saat itu.",
    "Skor confidence yang tinggi membuat AI meremehkan risiko entry dalam kondisi yang sebenarnya kompleks.",
    "Setup tampak kuat secara statistik namun faktor-faktor tersembunyi menyebabkan kegagalan.",
  ],
  low_quality_setup: [
    "Setup kualitas rendah — konfluensi sinyal tidak cukup kuat untuk mendukung entry.",
    "Trade diambil dengan sedikit konfirmasi teknikal, meningkatkan probabilitas kegagalan.",
    "Kualitas setup berada di bawah standar minimum yang dibutuhkan untuk trade dengan probabilitas tinggi.",
  ],
  unknown: [
    "Penyebab kegagalan tidak dapat diidentifikasi secara pasti dari data yang tersedia.",
    "Kombinasi faktor tidak terduga menyebabkan trade kena SL — diperlukan analisis lebih lanjut.",
    "Kondisi pasar tidak biasa yang tidak tercakup dalam model analisis standar.",
  ],
};

const CAUSE_RECOMMENDATIONS: Record<FailureCause, string[]> = {
  wrong_trend: [
    "Konfirmasi arah tren di timeframe yang lebih tinggi (1H/4H) sebelum entry.",
    "Tambahkan filter tren dengan EMA 200 — hanya long di atas EMA 200, short di bawah.",
    "Hindari counter-trend entry kecuali ada konfluensi reversal yang sangat kuat.",
  ],
  fake_breakout: [
    "Tunggu candle close di atas/bawah level breakout sebelum entry.",
    "Gunakan konfirmasi volume — breakout valid memerlukan volume > 1.5× rata-rata.",
    "Tambahkan delay entry 1-2 bar setelah breakout untuk menghindari fakeout.",
  ],
  weak_momentum: [
    "Pastikan RSI berada di atas 60 (untuk long) atau di bawah 40 (untuk short) sebelum entry.",
    "Tambahkan filter momentum: MACD histogram harus positif dan meningkat.",
    "Tunggu konfirmasi momentum sebelum eksekusi — jangan entry di RSI zona 40-60.",
  ],
  low_volume: [
    "Wajibkan volume > 1.3× rata-rata 20-bar sebagai syarat entry.",
    "Hindari entry saat volume lebih rendah dari rata-rata harian.",
    "Tambahkan filter volume konfirmasi — sinyal tanpa volume besar = tidak valid.",
  ],
  late_entry: [
    "Atur alert/notifikasi lebih awal agar tidak melewatkan momentum awal.",
    "Jika sudah melewati 50% dari pergerakan momentum, skip entry tersebut.",
    "Set batas maksimal: harga tidak boleh sudah bergerak > 0.8% dari zona entry ideal.",
  ],
  early_entry: [
    "Tunggu minimal 2 candle konfirmasi sebelum entry setelah sinyal terdeteksi.",
    "Gunakan pending order (limit order) bukan market order untuk entry lebih akurat.",
    "Tambahkan konfirmasi: candle bullish/bearish yang solid harus terbentuk dahulu.",
  ],
  incorrect_sl_placement: [
    "Gunakan ATR (Average True Range) × 1.5 sebagai dasar penempatan SL.",
    "SL minimum harus di luar swing high/low terdekat, bukan di dalam range volatilitas normal.",
    "Pertimbangkan level support/resistance dan liquidity zones saat menetapkan SL.",
  ],
  market_manipulation: [
    "Hindari entry di dekat level harga yang banyak terdapat cluster SL (obvious stop zones).",
    "Waspadai pergerakan mendadak tanpa berita fundamental — bisa jadi stop hunt.",
    "Gunakan SL yang 'tersembunyi' di bawah/atas level yang tidak obvious.",
  ],
  liquidity_sweep_trap: [
    "Identifikasi liquidity pools (cluster SL) sebelum entry — hindari masuk ke trap tersebut.",
    "Tunggu konfirmasi setelah sweep terjadi, lalu masuk searah dengan arah institusi.",
    "Gunakan pola liquidity sweep + reversal sebagai sinyal entry, bukan sebagai zona bahaya.",
  ],
  volatility_spike: [
    "Gunakan SL yang lebih lebar (ATR × 2) saat volatilitas pasar sedang tinggi.",
    "Kurangi ukuran posisi selama periode volatilitas tinggi.",
    "Hindari entry saat ATR atau Bollinger Band width jauh di atas normal.",
  ],
  news_impact: [
    "Cek kalender ekonomi sebelum entry — hindari trading 30 menit sebelum/sesudah rilis berita besar.",
    "Kurangi exposure saat pasar mendekati event penting (FOMC, CPI, dll).",
    "Gunakan posisi lebih kecil atau skip entry jika ada news high-impact dalam waktu dekat.",
  ],
  choppy_market: [
    "Gunakan filter market condition — hanya trade saat trending, bukan sideways.",
    "ADX < 20 = pasar ranging/choppy, skip semua entry directional.",
    "Tunggu breakout yang terkonfirmasi dari range sebelum masuk posisi.",
  ],
  weak_orderflow: [
    "Konfirmasi orderflow bias searah dengan entry sebelum eksekusi.",
    "Gunakan analisis order book dan tape reading untuk validasi arah.",
    "Jika orderflow netral atau berlawanan, kurangi ukuran posisi atau skip.",
  ],
  poor_risk_reward: [
    "Minimum R:R 1:2 — SL tidak boleh lebih besar dari setengah target profit.",
    "Jika R:R kurang dari 1:1.5, evaluasi ulang lokasi TP atau pertimbangkan skip.",
    "Audit confidence minimum: hanya entry di atas 75% confidence dengan R:R > 1:2.",
  ],
  mtf_conflict: [
    "Selalu konfirmasi arah di H1 atau H4 sebelum entry di timeframe yang lebih rendah.",
    "Jika tren mayor berlawanan dengan sinyal minor, kurangi posisi atau skip.",
    "Hanya ambil trade yang searah dengan tren di 2 timeframe berurutan ke atas.",
  ],
  overconfidence: [
    "Kalibrasi ulang threshold confidence — confidence tinggi tidak selalu berarti probabilitas tinggi.",
    "Selalu validasi dengan checklist multi-faktor, bukan hanya skor AI.",
    "Tambahkan buffer keamanan: confidence > 90 masih harus memenuhi semua kriteria manual.",
  ],
  low_quality_setup: [
    "Tingkatkan standar minimum konfluensi: butuh minimal 3 sinyal yang searah.",
    "Hindari trade dengan 1-2 konfirmasi saja — tunggu hingga setup memiliki lebih banyak faktor.",
    "Evaluasi kembali minimum confidence untuk entry — pertimbangkan menaikkan ke 78-80%.",
  ],
  unknown: [
    "Dokumentasikan kondisi pasar secara manual untuk membantu identifikasi pola di masa depan.",
    "Pertimbangkan mengurangi frekuensi trading sementara sambil mengumpulkan lebih banyak data.",
    "Review rekap trade ini secara berkala untuk mengidentifikasi faktor yang awalnya tidak terlihat.",
  ],
};

function generateConclusion(primary: FailureCause, input: SLAnalysisInput): string {
  const templates = CAUSE_CONCLUSIONS[primary];
  const idx = Math.floor(input.holdTimeMs % templates.length);
  let conclusion = templates[idx];

  // Enrich with specific data
  if (primary === "overconfidence") {
    conclusion += ` (Confidence: ${input.confidence}%, namun trade kena SL dalam ${Math.round(input.holdTimeMs / 60_000)}m)`;
  } else if (primary === "early_entry" || primary === "fake_breakout") {
    conclusion += ` (SL hit dalam ${Math.round(input.holdTimeMs / 60_000)} menit setelah entry)`;
  } else if (primary === "wrong_trend") {
    conclusion += ` (Kondisi: ${input.marketCondition ?? "tidak diketahui"}, Posisi: ${input.side.toUpperCase()})`;
  } else if (primary === "low_volume") {
    conclusion += ` (Volume ratio: ${input.volumeRatio?.toFixed(2) ?? "N/A"}×)`;
  }

  return conclusion;
}

function generateRecommendations(primary: FailureCause, secondary: FailureCause[]): string[] {
  const primaryRecs = CAUSE_RECOMMENDATIONS[primary] ?? [];
  const secondaryRecs = secondary.flatMap(c => (CAUSE_RECOMMENDATIONS[c] ?? []).slice(0, 1));
  const allRecs = [...primaryRecs, ...secondaryRecs];
  // Return top 4 unique recommendations
  return [...new Set(allRecs)].slice(0, 4);
}

// ─── Pattern Detection ────────────────────────────────────────────────────────

function updatePatterns(newRecord: SLFailureRecord): void {
  const WINDOW_MS = 7 * 24 * 60 * 60_000; // 7 days lookback
  const recentRecords = slState.records.filter(r => Date.now() - r.timestamp < WINDOW_MS);

  // Check for recurring cause patterns
  const causeCounts: Partial<Record<FailureCause, number>> = {};
  for (const r of recentRecords) {
    causeCounts[r.primaryCause] = (causeCounts[r.primaryCause] ?? 0) + 1;
  }

  // Update or create patterns
  for (const [causeStr, count] of Object.entries(causeCounts)) {
    const cause = causeStr as FailureCause;
    if (count < 3) continue; // need at least 3 occurrences

    const existingIdx = slState.patterns.findIndex(p => p.primaryCause === cause);
    const relatedRecords = recentRecords.filter(r => r.primaryCause === cause);
    const avgPnl = relatedRecords.reduce((s, r) => s + r.pnlPct, 0) / relatedRecords.length;
    const strategies = [...new Set(relatedRecords.map(r => r.strategy))];
    const conditions = [...new Set(relatedRecords.map(r => r.marketCondition))];

    const severity: FailurePattern["severity"] =
      count >= 10 ? "critical" : count >= 6 ? "high" : count >= 4 ? "medium" : "low";

    const rec = (CAUSE_RECOMMENDATIONS[cause] ?? ["Review strategi trading Anda."])[0];

    if (existingIdx >= 0) {
      slState.patterns[existingIdx] = {
        ...slState.patterns[existingIdx],
        occurrences: count,
        avgPnlPct: parseFloat(avgPnl.toFixed(2)),
        associatedStrategies: strategies,
        associatedConditions: conditions,
        severity,
        lastSeen: Date.now(),
      };
    } else {
      slState.patterns.push({
        id: crypto.randomUUID(),
        pattern: FAILURE_CAUSE_LABELS[cause],
        description: `Pola berulang: ${FAILURE_CAUSE_LABELS[cause]} terdeteksi ${count}× dalam 7 hari terakhir`,
        occurrences: count,
        primaryCause: cause,
        associatedStrategies: strategies,
        associatedConditions: conditions,
        avgPnlPct: parseFloat(avgPnl.toFixed(2)),
        recommendation: rec,
        severity,
        firstSeen: relatedRecords[0]?.timestamp ?? Date.now(),
        lastSeen: Date.now(),
      });
    }
  }

  // Sort patterns by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  slState.patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function updateImprovementScore(newRecord: SLFailureRecord): void {
  // Improvement score increases if the same mistake is not repeated for a while
  const recentSame = slState.records
    .slice(-10)
    .filter(r => r.primaryCause === newRecord.primaryCause && r.id !== newRecord.id);

  if (recentSame.length === 0) {
    // This cause hasn't appeared recently — good
    slState.improvementScore = Math.min(100, slState.improvementScore + 1);
  } else if (recentSame.length >= 3) {
    // Repeated mistake — score decreases
    slState.improvementScore = Math.max(0, slState.improvementScore - 3);
  }
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

export function analyzeSLFailure(input: SLAnalysisInput): SLFailureRecord {
  const { primary, secondary, severity } = detectFailureCauses(input);
  const conclusion = generateConclusion(primary, input);
  const recommendations = generateRecommendations(primary, secondary);
  const slTightnessPct = Math.abs((input.slPrice - input.entryPrice) / input.entryPrice * 100);

  const record: SLFailureRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    tradeId: input.tradeId,
    symbol: input.symbol,
    side: input.side,
    entryPrice: input.entryPrice,
    slPrice: input.slPrice,
    exitPrice: input.exitPrice,
    pnlPct: parseFloat(input.pnlPct.toFixed(3)),
    confidence: input.confidence,
    strategy: input.strategy ?? "unknown",
    marketCondition: input.marketCondition ?? "unknown",
    holdTimeMs: input.holdTimeMs,
    primaryCause: primary,
    secondaryCauses: secondary,
    conclusion,
    recommendations,
    severity,
    slTightnessPct: parseFloat(slTightnessPct.toFixed(3)),
    improvementApplied: false,
  };

  // Persist
  slState.records.unshift(record);
  if (slState.records.length > 500) slState.records.splice(500);
  slState.totalAnalyzed++;

  updatePatterns(record);
  updateImprovementScore(record);
  saveSLState();

  logger.info({
    symbol: input.symbol,
    cause: primary,
    severity,
    confidence: input.confidence,
    holdMin: Math.round(input.holdTimeMs / 60_000),
  }, "SL failure analyzed");

  return record;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export function getSLAnalyticsStats(): SLAnalyticsStats {
  const records = slState.records;

  const causeCounts: Partial<Record<FailureCause, number>> = {};
  for (const r of records) {
    causeCounts[r.primaryCause] = (causeCounts[r.primaryCause] ?? 0) + 1;
  }

  const mostCommonCauses = Object.entries(causeCounts)
    .map(([cause, count]) => ({
      cause: cause as FailureCause,
      label: FAILURE_CAUSE_LABELS[cause as FailureCause] ?? cause,
      count: count!,
      pct: records.length > 0 ? parseFloat(((count! / records.length) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Worst strategies
  const stratMap: Record<string, { count: number; totalPnl: number }> = {};
  for (const r of records) {
    if (!stratMap[r.strategy]) stratMap[r.strategy] = { count: 0, totalPnl: 0 };
    stratMap[r.strategy].count++;
    stratMap[r.strategy].totalPnl += r.pnlPct;
  }
  const worstStrategies = Object.entries(stratMap)
    .map(([strategy, v]) => ({
      strategy,
      slCount: v.count,
      avgPnlPct: parseFloat((v.totalPnl / v.count).toFixed(2)),
    }))
    .sort((a, b) => b.slCount - a.slCount)
    .slice(0, 5);

  // Worst conditions
  const condMap: Record<string, number> = {};
  for (const r of records) {
    condMap[r.marketCondition] = (condMap[r.marketCondition] ?? 0) + 1;
  }
  const worstConditions = Object.entries(condMap)
    .map(([condition, slCount]) => ({ condition, slCount }))
    .sort((a, b) => b.slCount - a.slCount)
    .slice(0, 5);

  const severityBreakdown = {
    minor: records.filter(r => r.severity === "minor").length,
    moderate: records.filter(r => r.severity === "moderate").length,
    major: records.filter(r => r.severity === "major").length,
  };

  const avgHoldTimeMs = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.holdTimeMs, 0) / records.length) : 0;

  const avgConfidenceOnSL = records.length > 0
    ? parseFloat((records.reduce((s, r) => s + r.confidence, 0) / records.length).toFixed(1)) : 0;

  const overconfidenceRate = records.length > 0
    ? parseFloat(((records.filter(r => r.confidence >= 80).length / records.length) * 100).toFixed(1)) : 0;

  return {
    totalStopLosses: records.length,
    causeCounts,
    worstStrategies,
    worstConditions,
    mostCommonCauses,
    patterns: [...slState.patterns],
    improvementScore: slState.improvementScore,
    recentAnalyses: records.slice(0, 20),
    severityBreakdown,
    avgHoldTimeMs,
    avgConfidenceOnSL,
    overconfidenceRate,
  };
}

export function getSLFailureRecord(id: string): SLFailureRecord | null {
  return slState.records.find(r => r.id === id) ?? null;
}

export function getAllSLRecords(): SLFailureRecord[] {
  return [...slState.records];
}

export function getSLPatterns(): FailurePattern[] {
  return [...slState.patterns];
}

// ─── Avoidance Rule Checking ──────────────────────────────────────────────────

export function getShouldAvoidSetup(params: {
  marketCondition?: string;
  confidence?: number;
  volumeRatio?: number;
  isChoppy?: boolean;
}): { shouldAvoid: boolean; reason: string; severity: string } | null {
  const { marketCondition, confidence, volumeRatio, isChoppy } = params;
  const patterns = slState.patterns.filter(p => p.severity === "critical" || p.severity === "high");

  for (const p of patterns) {
    if (
      p.primaryCause === "choppy_market" &&
      (isChoppy || marketCondition?.toLowerCase().includes("choppy"))
    ) {
      return { shouldAvoid: true, reason: p.recommendation, severity: p.severity };
    }
    if (p.primaryCause === "low_volume" && volumeRatio !== undefined && volumeRatio < 0.9) {
      return { shouldAvoid: true, reason: p.recommendation, severity: p.severity };
    }
    if (p.primaryCause === "overconfidence" && confidence !== undefined && confidence >= 88) {
      return { shouldAvoid: false, reason: "Perhatian: Overconfidence pattern aktif — verifikasi manual direkomendasikan", severity: "medium" };
    }
  }
  return null;
}
