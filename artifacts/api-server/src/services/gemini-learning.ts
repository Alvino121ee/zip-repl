/**
 * Groq Learning Service
 * AI menganalisis skill sendiri, membuat pertanyaan bervariasi dari pool besar,
 * mengirim ke Groq Cloud API, lalu menyimpan jawaban ke bank pengetahuan.
 * Mode: manual sesi, auto (interval), dan continuous (on/off tanpa batas).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { manualTrain, getBrainStats, saveGroqAnswer } from "./ai-continuous-learning.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = join(__dirname, "../../data");
const SETTINGS_FILE = join(DATA_DIR, "groq-settings.json");

// ─── Persisted Settings ───────────────────────────────────────────────────────

interface GroqPersistedSettings {
  autoEnabled: boolean;
  autoIntervalMinutes: number;
  continuousEnabled: boolean;
  totalSessionsRun: number;
  totalXPEarned: number;
  questionCount: number;
  usedHashes: string[];
}

function loadSettings(): GroqPersistedSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8")) as GroqPersistedSettings;
    }
  } catch { /* fall through */ }
  return { autoEnabled: false, autoIntervalMinutes: 60, continuousEnabled: false, totalSessionsRun: 0, totalXPEarned: 0, questionCount: 5, usedHashes: [] };
}

function saveSettings(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify({
      autoEnabled, autoIntervalMinutes, continuousEnabled,
      totalSessionsRun, totalXPEarned, questionCount: persistedQuestionCount,
      usedHashes: [...usedHashes].slice(-2000),
    } satisfies GroqPersistedSettings, null, 2), "utf-8");
  } catch (err) {
    logger.warn("Failed to save groq settings", { error: String(err) });
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeminiLogEntry {
  timestamp: number;
  type: "question" | "answer" | "save" | "error" | "info";
  category: string;
  message: string;
  xpGained?: number;
  grade?: string;
}

export interface GeminiSession {
  id: string;
  startedAt: number;
  completedAt: number | null;
  totalQuestions: number;
  completedQuestions: number;
  totalXP: number;
  log: GeminiLogEntry[];
  status: "idle" | "running" | "completed" | "error";
}

export interface GeminiStatus {
  hasApiKey: boolean;
  currentSession: GeminiSession | null;
  lastSession: GeminiSession | null;
  totalSessionsRun: number;
  totalXPEarned: number;
  autoEnabled: boolean;
  autoIntervalMinutes: number;
  nextAutoAt: number | null;
  continuousEnabled: boolean;
  provider: string;
  model: string;
  questionCount: number;
  totalUniqueQuestionsPool: number;
  usedHashesCount: number;
}

// ─── Pool Topik (14 skill × 12 topik = 168 topik unik) ──────────────────────

const SKILL_TO_TOPICS: Record<string, { category: string; topics: string[] }> = {
  patternRecognition: {
    category: "Pola Chart",
    topics: [
      "pola candlestick reversal Hammer, Doji, Engulfing, Pin Bar dan cara konfirmasinya dengan volume",
      "pola chart continuation Bull Flag, Pennant, Ascending Triangle dan cara entry yang presisi",
      "cara mengenali fake breakout vs breakout asli menggunakan volume dan struktur harga",
      "pola Double Top, Double Bottom, Head and Shoulders dan cara mengukur target harganya",
      "cara membaca Inside Bar dan Outside Bar sebagai sinyal kelanjutan atau pembalikan tren",
      "pola Morning Star, Evening Star, Three White Soldiers dan Three Black Crows sebagai reversal kuat",
      "pola Rising Wedge, Falling Wedge, dan Symmetrical Triangle — cara identifikasi dan trading",
      "cara membaca Tweezer Top/Bottom dan Harami sebagai konfirmasi reversal di level kunci",
      "pola Cup and Handle dan Rounding Bottom sebagai setup breakout jangka menengah",
      "cara mengidentifikasi konsolidasi tight vs loose dan implikasinya untuk entry breakout",
      "pola Inverse Head and Shoulders dan cara mengukur target profit minimalnya",
      "cara membaca pola Kangaroo Tail dan Spring di area support/resistance kritis",
    ],
  },
  marketReading: {
    category: "Konsep Pasar",
    topics: [
      "cara membaca market structure Higher High, Higher Low, Lower High, Lower Low dengan benar",
      "pengaruh Bitcoin dominance terhadap altcoin dan cara memanfaatkan fase altcoin season",
      "cara membaca Fear & Greed Index untuk timing entry dan exit yang optimal",
      "konsep support dan resistance dinamis vs statis dan mana yang lebih reliable untuk trading",
      "cara mengidentifikasi fase akumulasi, markup, distribusi, dan markdown di pasar crypto",
      "cara membaca sentiment pasar melalui funding rate dan open interest di crypto futures",
      "analisis korelasi BTC-altcoin dan strategi rotation capital saat dominance berubah",
      "cara membaca orderbook dan depth chart untuk memahami tekanan beli/jual sesaat",
      "konsep liquidity zones dan cara mengidentifikasi area di mana harga kemungkinan besar berhenti",
      "cara membaca market breadth dan rotasi sektor untuk menentukan fase pasar secara keseluruhan",
      "pengaruh macro economics (inflasi, suku bunga Fed) terhadap pergerakan crypto dan IDX",
      "cara menggunakan data on-chain seperti exchange flow dan whale movement untuk trading",
    ],
  },
  trendAnalysis: {
    category: "Indikator Teknikal",
    topics: [
      "strategi trading menggunakan EMA 9, 21, 50 untuk konfirmasi tren dan sinyal entry",
      "cara menggunakan MACD untuk mengidentifikasi momentum dan divergensi di crypto",
      "cara membaca Ichimoku Cloud sebagai sistem analisis tren lengkap dengan semua komponennya",
      "penggunaan ADX Average Directional Index untuk mengukur kekuatan tren sebelum entry",
      "strategi crossover EMA dan cara menghindari false signal di pasar sideways",
      "cara menggunakan Supertrend indicator untuk trailing stop dan konfirmasi tren",
      "strategi triple EMA crossover 5, 13, 21 untuk sinyal entry yang lebih akurat",
      "cara menggunakan Parabolic SAR untuk trailing stop loss dan identifikasi pembalikan tren",
      "analisis multi-timeframe trend: cara menyelaraskan tren D1, H4, H1 sebelum entry",
      "cara membaca Hull Moving Average vs EMA biasa dan kelebihan masing-masing",
      "penggunaan Linear Regression Channel untuk menentukan tren dan level overbought/oversold",
      "cara trading menggunakan Golden Cross dan Death Cross di berbagai timeframe",
    ],
  },
  volumeAnalysis: {
    category: "Indikator Teknikal",
    topics: [
      "cara membaca Volume Profile dan Point of Control POC untuk support/resistance kuat",
      "analisis On-Balance Volume OBV untuk konfirmasi tren dan deteksi divergensi",
      "cara menggunakan volume spike untuk mengkonfirmasi breakout yang valid",
      "konsep Volume Weighted Average Price VWAP dan strategi trading di sekitar level ini",
      "cara membaca Chaikin Money Flow CMF untuk mendeteksi tekanan beli/jual institusional",
      "cara membaca Accumulation/Distribution Line untuk mendeteksi akumulasi tersembunyi",
      "analisis Volume at Price VAP untuk menemukan area high-value dan low-value",
      "cara membaca Klinger Oscillator untuk konfirmasi sinyal beli/jual berbasis volume",
      "cara menggunakan volume divergence untuk mengantisipasi pembalikan tren",
      "cara membaca delta volume dan imbalance di level candle untuk intraday trading",
      "strategi VWAP anchored dari swing high/low untuk bias harian",
      "cara membaca volume profile sesi London, New York, dan Asia untuk crypto 24 jam",
    ],
  },
  momentumReading: {
    category: "Indikator Teknikal",
    topics: [
      "cara membaca divergensi RSI bullish dan bearish dengan contoh setup konkret",
      "strategi scalping menggunakan RSI di timeframe 5 menit dengan filter yang tepat",
      "penggunaan Stochastic Oscillator untuk entry di area oversold dan overbought",
      "cara menggunakan Momentum Indicator dan Rate of Change ROC dalam trading",
      "kombinasi RSI dan MACD untuk konfirmasi sinyal entry yang lebih akurat",
      "cara membaca RSI hidden divergence untuk konfirmasi continuation trend",
      "penggunaan Williams %R untuk timing entry presisi di level ekstrem",
      "cara menggunakan CCI Commodity Channel Index untuk mendeteksi overbought/oversold",
      "strategi RSI 2-period untuk scalping pullback di tren yang kuat",
      "cara membaca Money Flow Index MFI sebagai RSI berbasis volume",
      "penggunaan Awesome Oscillator untuk konfirmasi momentum dan sinyal entry",
      "cara menggabungkan multiple momentum oscillator untuk menghindari false signal",
    ],
  },
  candlePsychology: {
    category: "Pola Chart",
    topics: [
      "psikologi di balik setiap jenis candlestick: apa yang terjadi antara buyer dan seller",
      "cara membaca Marubozu, Spinning Top, dan Long Shadow dalam konteks market sentiment",
      "pola Three White Soldiers dan Three Black Crows: cara identifikasi dan strategi trading",
      "cara membaca candlestick di dekat level kunci untuk sinyal reversal yang kuat",
      "kombinasi pola candlestick dengan volume untuk meningkatkan akurasi sinyal entry",
      "cara membaca Gravestone Doji dan Dragonfly Doji sebagai sinyal reversal kuat",
      "psikologi bullish dan bearish engulfing: mengapa candle ini sangat powerful di support/resistance",
      "cara membaca pola Kicker Reversal sebagai salah satu sinyal paling kuat di candlestick",
      "pola Three Inside Up dan Three Inside Down sebagai konfirmasi reversal setelah Harami",
      "cara membaca high-wave candle dan spinning top untuk mendeteksi ketidakpastian pasar",
      "cara membaca tasuki gap dan upside/downside gap three methods sebagai continuation pattern",
      "analisis body-to-shadow ratio candlestick untuk mengukur kekuatan buyer vs seller",
    ],
  },
  smartMoneyConceptSkill: {
    category: "Smart Money",
    topics: [
      "cara mengidentifikasi Order Block institusional yang valid dan cara trading di sekitarnya",
      "konsep Liquidity Sweep: cara smart money mengambil likuiditas retail sebelum membalik",
      "perbedaan Break of Structure BOS dan Change of Character CHOCH dan cara tradingnya",
      "Fair Value Gap FVG dan imbalance: cara identifikasi dan memanfaatkan untuk entry",
      "Premium dan Discount Zone menggunakan Fibonacci: cara smart money selalu buy di discount",
      "konsep Inducement dalam SMC: cara smart money menjebak retail trader sebelum bergerak",
      "cara mengidentifikasi Institutional Candle dan cara trading di retest-nya",
      "konsep Market Maker Model: bagaimana harga bergerak dari accumulation ke distribution",
      "cara trading menggunakan Optimal Trade Entry OTE di level 0.618-0.79 Fibonacci",
      "cara membaca Turtle Soup pattern sebagai setup liquidity grab yang powerful",
      "analisis Weekly Profile SMC: cara membaca siklus mingguan untuk bias trading",
      "cara menggabungkan SMC dengan Supply Demand Zone untuk meningkatkan akurasi entry",
    ],
  },
  orderflowReading: {
    category: "Smart Money",
    topics: [
      "cara membaca orderflow dan bid-ask imbalance untuk mendeteksi tekanan institusional",
      "konsep Breaker Block dan cara membedakannya dari Order Block biasa",
      "cara menggunakan Footprint Chart dan Delta untuk menganalisis orderflow real-time",
      "konsep Mitigation Block dan cara memanfaatkannya untuk entry presisi tinggi",
      "cara membaca tape reading dan Level 2 quotes untuk intraday crypto trading",
      "cara membaca absorption dan exhaustion di level kunci menggunakan orderflow",
      "konsep Imbalance Zones dari perspektif orderflow dan cara tradingnya",
      "cara membaca stacked imbalances sebagai area support/resistance institusional yang kuat",
      "penggunaan volume ladder untuk mengidentifikasi single print dan trading range",
      "cara membaca aggressive buying/selling di market profile untuk konfirmasi arah",
      "cara mengidentifikasi trapped traders dan memanfaatkan stop loss hunting",
      "cara membaca delta divergence sebagai sinyal awal pembalikan harga",
    ],
  },
  riskManagement: {
    category: "Manajemen Risiko",
    topics: [
      "framework manajemen risiko lengkap: position sizing, stop loss, risk per trade, dan drawdown",
      "cara menghitung Risk/Reward Ratio optimal dan hubungannya dengan win rate minimum",
      "strategi Partial Take Profit: kapan ambil 50% di TP1 dan sisanya di TP2/TP3",
      "cara mengatur trailing stop loss berbasis ATR, struktur, atau persentase",
      "konsep Kelly Criterion dan cara menerapkannya untuk sizing posisi yang optimal",
      "cara menghitung maximum drawdown yang dapat ditoleransi dan strategi recovery-nya",
      "strategi diversifikasi portfolio crypto: cara mengalokasikan modal antar aset",
      "cara mengelola risiko saat trading di altcoin yang volatilitasnya jauh lebih tinggi dari BTC",
      "konsep Expectancy dalam trading dan cara menggunakannya untuk evaluasi sistem",
      "cara menggunakan ATR Average True Range untuk menentukan stop loss yang dinamis",
      "strategi hedging sederhana menggunakan stablecoin saat kondisi pasar tidak pasti",
      "cara menghitung correlation antar aset untuk menghindari risiko konsentrasi portfolio",
    ],
  },
  emotionalDiscipline: {
    category: "Psikologi Trading",
    topics: [
      "cara mengatasi FOMO Fear of Missing Out dengan sistem aturan trading yang ketat",
      "bahaya revenge trading dan langkah konkret menghentikan siklus kerugian setelah loss besar",
      "cara membangun mindset trader profesional: cara melihat loss, ekspektasi, dan konsistensi",
      "teknik journaling trading yang efektif untuk mengidentifikasi pola kesalahan berulang",
      "cara mengelola emosi saat profit besar: menghindari overconfidence dan greedy",
      "cara membangun sistem checklist pre-trade untuk menghindari keputusan impulsif",
      "teknik mental rehearsal dan visualization untuk mempersiapkan diri menghadapi skenario trading",
      "cara mengidentifikasi bias kognitif dalam trading: confirmation bias, recency bias, anchoring",
      "strategi detox dari market: kapan harus stop trading dan bagaimana recovery mindset",
      "cara membangun accountability dalam trading: mentor, trading partner, atau jurnal publik",
      "teknik breathing dan mindfulness untuk menjaga ketenangan saat menghadapi drawdown",
      "cara membedakan gut feeling yang valid dari impulse trading yang berbahaya",
    ],
  },
  patience: {
    category: "Psikologi Trading",
    topics: [
      "teknik menunggu setup yang sempurna dan menghindari overtrading di pasar sideways",
      "cara membangun rutinitas trading harian yang disiplin dan konsisten",
      "strategi selective trading: cara memilih hanya setup dengan probabilitas tertinggi",
      "cara mengatur waktu trading yang efektif dan menghindari screen time berlebihan",
      "teknik mindfulness dan meditasi untuk meningkatkan fokus dan kesabaran dalam trading",
      "cara menggunakan pending order untuk menghindari chasing entry yang tergesa-gesa",
      "cara membangun sistem reward diri sendiri untuk perilaku trading yang disiplin",
      "teknik time-blocking untuk trading: menentukan sesi trading terbaik dan mematuhinya",
      "cara mengatasi boredom trading yang sering mendorong overtrading saat pasar sepi",
      "strategi membangun pipeline setup: selalu siapkan 3-5 potensi trade sebelum market buka",
      "cara memanfaatkan waktu non-trading untuk analisis, belajar, dan evaluasi tanpa stress",
      "teknik detachment dari hasil trade: cara fokus pada proses bukan outcome setiap trade",
    ],
  },
  selectivity: {
    category: "Strategi",
    topics: [
      "cara membangun checklist entry yang ketat untuk meningkatkan kualitas setiap trade",
      "strategi multi-timeframe analysis: gunakan timeframe tinggi untuk bias, rendah untuk entry",
      "cara memilih pair crypto yang paling berpotensi di setiap kondisi pasar",
      "teknik confluence trading: menggabungkan 3-4 faktor konfirmasi sebelum entry",
      "cara mengevaluasi dan meningkatkan sistem trading berdasarkan data historis",
      "cara membuat trade scorecard untuk menilai kualitas setup sebelum masuk posisi",
      "teknik market screening: cara efisien menemukan setup terbaik dari ratusan aset",
      "cara menggunakan watch list dinamis yang selalu diperbarui berdasarkan kondisi pasar",
      "strategi quality over quantity: bagaimana mengurangi jumlah trade tapi meningkatkan profit",
      "cara membangun edge yang spesifik: fokus pada 1-2 setup yang benar-benar dikuasai",
      "teknik gap analysis: mencari perbedaan antara rencana trading dan eksekusi aktual",
      "cara menggunakan statistical edge untuk hanya mengambil trade di atas threshold probabilitas",
    ],
  },
  adaptiveIntelligence: {
    category: "Strategi",
    topics: [
      "cara beradaptasi strategi trading saat kondisi pasar berubah dari trending ke sideways",
      "perbedaan strategi trading saat market bullish, bearish, dan sideways",
      "cara membangun sistem trading yang adaptif berdasarkan volatilitas pasar menggunakan ATR",
      "teknik backtesting manual dan otomatis untuk memvalidasi strategi trading",
      "cara mengoptimalkan parameter strategi tanpa overfitting ke data historis",
      "cara mendeteksi perubahan regime pasar secara early dan menyesuaikan strategi",
      "strategi trading saat volatilitas tinggi vs rendah: penyesuaian target dan stop loss",
      "cara membangun playbook trading yang mencakup semua skenario pasar yang mungkin terjadi",
      "teknik forward testing: cara memvalidasi strategi di market live dengan risiko terkontrol",
      "cara menggunakan machine learning thinking dalam trading: probabilistic vs deterministic",
      "strategi adaptasi saat berita besar atau event macro memengaruhi pasar secara mendadak",
      "cara membangun trading plan yang fleksibel namun tetap memiliki aturan yang jelas",
    ],
  },
  predictionAccuracy: {
    category: "Strategi",
    topics: [
      "cara meningkatkan akurasi prediksi dengan menggunakan confluens multiple timeframe",
      "teknik probability assessment: cara menghitung probabilitas setup sebelum entry",
      "cara menggunakan statistik win rate dan expectancy untuk evaluasi sistem trading",
      "metode Bayesian thinking dalam trading: cara update bias berdasarkan informasi baru",
      "cara membuat sistem scoring setup trading untuk memprioritaskan trade terbaik",
      "cara mengkalibrasi kepercayaan diri dengan data aktual win rate per setup",
      "teknik hypothesis testing dalam trading: cara menguji apakah edge masih valid",
      "cara menggunakan base rate dan conditional probability untuk estimasi trade outcome",
      "strategi improving signal quality: cara memfilter noise dari sinyal yang benar-benar valid",
      "cara membangun prediction log untuk melacak akurasi prediksi secara kuantitatif",
      "teknik pre-mortem analysis: bayangkan trade gagal dan identifikasi penyebabnya sebelum entry",
      "cara menggunakan market internals untuk meningkatkan akurasi prediksi arah market",
    ],
  },
};

// ─── 8 Variasi Gaya Pertanyaan ────────────────────────────────────────────────

const QUESTION_ANGLES = [
  (topic: string, score: string) =>
    `Jelaskan secara mendalam dan praktis tentang ${topic}. Berikan 3 contoh konkret dengan angka spesifik (entry, stop loss, target). Apa kesalahan umum yang harus dihindari? Skor skill AI saat ini: ${score}%`,
  (topic: string, score: string) =>
    `Sebagai trader profesional berpengalaman di pasar Indonesia, bagaimana kamu menerapkan ${topic} dalam kondisi pasar crypto/IDX nyata? Kapan paling efektif dan kapan harus dihindari? Berikan skenario konkret. Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Buat panduan step-by-step lengkap tentang ${topic} — dari cara identifikasi setup, konfirmasi sinyal, entry trigger, manajemen posisi, target profit, hingga kriteria invalidasi. Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Apa yang membedakan trader pemula dari trader profesional dalam menerapkan ${topic}? Jelaskan kesalahan paling fatal dan cara menghindarinya, lengkap dengan contoh nyata dari pasar crypto. Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Bagaimana ${topic} bekerja dalam kondisi pasar yang berbeda: bullish kuat, bearish, sideways, dan high volatility? Jelaskan penyesuaian strategi yang perlu dilakukan di setiap kondisi dengan contoh spesifik. Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Dari perspektif Smart Money dan institusional, bagaimana ${topic} digunakan atau dimanipulasi oleh big player? Bagaimana trader retail bisa memanfaatkan pemahaman ini untuk masuk di sisi yang benar? Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Bandingkan ${topic} dengan metode atau indikator alternatif yang sering digunakan. Kapan masing-masing lebih cocok? Bagaimana menggabungkannya untuk sinyal yang lebih kuat? Berikan contoh konkret dari chart nyata. Skor skill AI: ${score}%`,
  (topic: string, score: string) =>
    `Jelaskan psikologi pasar dan price action di balik ${topic} — mengapa konsep ini terjadi, siapa yang mendorong pergerakan harga, dan bagaimana trader cerdas memanfaatkan pola ini secara konsisten. Skor skill AI: ${score}%`,
];

// ─── Fallback Topics ──────────────────────────────────────────────────────────

const FALLBACK_TOPICS = [
  { category: "Strategi",          skill: "general", topic: "strategi scalping crypto di timeframe 1-5 menit: jam terbaik, pair terbaik, manajemen posisi, dan cara menghindari overtrading" },
  { category: "Manajemen Risiko",  skill: "general", topic: "cara membangun sistem manajemen modal yang kokoh untuk trader full-time crypto dengan drawdown terkontrol" },
  { category: "Psikologi Trading", skill: "general", topic: "cara membangun mentalitas trader profesional yang konsisten dan tidak terpengaruh hasil jangka pendek" },
  { category: "Smart Money",       skill: "general", topic: "cara membaca institutional order flow dan memanfaatkan pergerakan smart money di crypto" },
  { category: "Konsep Pasar",      skill: "general", topic: "analisis makro crypto: cara membaca siklus bull-bear dan rotasi kapital antar sektor" },
  { category: "Indikator Teknikal",skill: "general", topic: "cara membangun sistem trading berbasis multiple timeframe dengan indikator konfluens untuk entry presisi" },
  { category: "Pola Chart",        skill: "general", topic: "cara membaca price action murni tanpa indikator: support, resistance, tren, dan pattern key level" },
  { category: "Strategi",          skill: "general", topic: "cara membangun edge trading yang konsisten dan cara mengukur apakah edge masih valid di kondisi pasar saat ini" },
];

// ─── State ────────────────────────────────────────────────────────────────────

const _saved = loadSettings();

let currentSession:       GeminiSession | null = null;
let lastSession:          GeminiSession | null = null;
let totalSessionsRun    = _saved.totalSessionsRun;
let totalXPEarned       = _saved.totalXPEarned;
let autoEnabled         = false;
let autoIntervalMinutes = _saved.autoIntervalMinutes;
let nextAutoAt: number | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let continuousEnabled   = false;
let persistedQuestionCount = _saved.questionCount;
const usedHashes        = new Set<string>(_saved.usedHashes ?? []);

// ─── Question Hash ────────────────────────────────────────────────────────────

function makeHash(skill: string, topicIdx: number, angleIdx: number): string {
  return `${skill}::${topicIdx}::${angleIdx}`;
}

function getTotalPool(): number {
  const topicCount = Object.values(SKILL_TO_TOPICS).reduce((s, m) => s + m.topics.length, 0);
  return topicCount * QUESTION_ANGLES.length + FALLBACK_TOPICS.length * QUESTION_ANGLES.length;
}

// ─── Generate Pertanyaan (tidak pernah sama sampai pool habis) ────────────────

function generateQuestionsFromNeeds(count: number): Array<{ category: string; question: string; skill: string; hash: string }> {
  const brain = getBrainStats();

  const skillScores: Array<{ skill: string; score: number }> = [
    { skill: "patternRecognition",     score: brain.patternRecognition },
    { skill: "marketReading",          score: brain.marketReading },
    { skill: "trendAnalysis",          score: brain.trendAnalysis },
    { skill: "volumeAnalysis",         score: brain.volumeAnalysis },
    { skill: "momentumReading",        score: brain.momentumReading },
    { skill: "candlePsychology",       score: brain.candlePsychology },
    { skill: "smartMoneyConceptSkill", score: brain.smartMoneyConceptSkill },
    { skill: "orderflowReading",       score: brain.orderflowReading },
    { skill: "riskManagement",         score: brain.riskManagement },
    { skill: "emotionalDiscipline",    score: brain.emotionalDiscipline },
    { skill: "patience",               score: brain.patience },
    { skill: "selectivity",            score: brain.selectivity },
    { skill: "adaptiveIntelligence",   score: brain.adaptiveIntelligence },
    { skill: "predictionAccuracy",     score: brain.predictionAccuracy },
  ].sort((a, b) => a.score - b.score);

  const questions: Array<{ category: string; question: string; skill: string; hash: string }> = [];
  const sessionUsed = new Set<string>();

  for (let pass = 0; pass < 2 && questions.length < count; pass++) {
    if (pass === 1) {
      usedHashes.clear();
      logger.info("Groq question pool cycled — resetting used hashes");
    }
    for (const { skill, score } of skillScores) {
      if (questions.length >= count) break;
      const mapping = SKILL_TO_TOPICS[skill];
      if (!mapping) continue;

      const scoreStr = score.toFixed(1);
      let found = false;
      const topicOrder = [...mapping.topics.keys()].sort(() => Math.random() - 0.5);
      for (const tIdx of topicOrder) {
        if (found) break;
        const angleOrder = [...QUESTION_ANGLES.keys()].sort(() => Math.random() - 0.5);
        for (const aIdx of angleOrder) {
          const hash = makeHash(skill, tIdx, aIdx);
          if (usedHashes.has(hash) || sessionUsed.has(hash)) continue;
          const q = QUESTION_ANGLES[aIdx](mapping.topics[tIdx], scoreStr);
          questions.push({ category: mapping.category, skill, question: q, hash });
          sessionUsed.add(hash);
          found = true;
          break;
        }
      }
    }
  }

  // Fallback jika masih kurang
  for (let fi = 0; questions.length < count; fi++) {
    const fb = FALLBACK_TOPICS[fi % FALLBACK_TOPICS.length];
    const aIdx = Math.floor(Math.random() * QUESTION_ANGLES.length);
    const hash = `fallback::${fi % FALLBACK_TOPICS.length}::${aIdx}`;
    if (!sessionUsed.has(hash)) {
      const q = QUESTION_ANGLES[aIdx](fb.topic, "0");
      questions.push({ category: fb.category, skill: fb.skill, question: q, hash });
      sessionUsed.add(hash);
    }
    if (fi > 40) break;
  }

  return questions.slice(0, count);
}

// ─── Groq API Call ────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diset");

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: `Kamu adalah expert trader profesional dengan pengalaman lebih dari 10 tahun di pasar crypto dan saham Indonesia (IDX).
Berikan jawaban yang mendalam, praktis, dan actionable dalam Bahasa Indonesia.
Fokus pada pengetahuan trading yang bisa langsung diterapkan oleh trader Indonesia.
Jawaban harus mencakup: penjelasan konsep, kapan/bagaimana menerapkannya, contoh konkret dengan angka spesifik, dan hal-hal yang harus dihindari.
Panjang jawaban: 4-6 paragraf yang padat, informatif, dan kaya detail teknikal.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.82,
      max_tokens: 1200,
      top_p: 0.95,
    }),
  });

  if (!resp.ok) throw new Error(`Groq API error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? "Unknown Groq error");
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Groq mengembalikan jawaban kosong");
  return text.trim();
}

// ─── Session Runner ───────────────────────────────────────────────────────────

export async function runGeminiSession(questionCount = 5): Promise<GeminiSession> {
  if (currentSession?.status === "running") throw new Error("Sesi sedang berjalan");
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY belum dikonfigurasi");

  persistedQuestionCount = questionCount;

  const questions = generateQuestionsFromNeeds(questionCount);
  const sessionId  = `groq-${Date.now()}`;
  const session: GeminiSession = {
    id: sessionId, startedAt: Date.now(), completedAt: null,
    totalQuestions: questionCount, completedQuestions: 0, totalXP: 0,
    log: [], status: "running",
  };
  currentSession = session;

  const focusCategories = [...new Set(questions.map(q => q.category))].join(", ");
  session.log.push({ timestamp: Date.now(), type: "info", category: "Sistem",
    message: `🧠 Sesi #${totalSessionsRun + 1} dimulai — ${questionCount} pertanyaan unik via Groq (${GROQ_MODEL}) | Fokus: ${focusCategories}` });

  for (let i = 0; i < questions.length; i++) {
    const { category, question, skill, hash } = questions[i];
    session.log.push({ timestamp: Date.now(), type: "question", category,
      message: `❓ [${i + 1}/${questionCount}] [${category}] ${question.slice(0, 120)}...` });

    try {
      const answer = await callGroq(question);
      session.log.push({ timestamp: Date.now(), type: "answer", category,
        message: `✅ Groq menjawab (${answer.length} karakter) — disimpan ke memori AI` });

      const trainResult = manualTrain(answer);
      saveGroqAnswer({ title: question.slice(0, 100), category, skill, fullAnswer: answer, xpGained: trainResult.xpGained });

      usedHashes.add(hash);
      session.completedQuestions++;
      session.totalXP += trainResult.xpGained;

      session.log.push({ timestamp: Date.now(), type: "save", category,
        message: `💾 Tersimpan — Grade ${trainResult.grade}, +${trainResult.xpGained} XP | Skill: ${trainResult.skillsImproved.map(s => s.label).join(", ") || "-"}`,
        xpGained: trainResult.xpGained, grade: trainResult.grade });

      logger.info("Groq answer saved", { category, skill, grade: trainResult.grade, xp: trainResult.xpGained });
      await new Promise(r => setTimeout(r, 700));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      session.log.push({ timestamp: Date.now(), type: "error", category, message: `❌ Error: ${msg}` });
      logger.warn("Groq session error", { category, skill, error: msg });
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  session.status = "completed";
  session.completedAt = Date.now();
  lastSession = { ...session };
  currentSession = null;
  totalSessionsRun++;
  totalXPEarned += session.totalXP;
  saveSettings();

  session.log.push({ timestamp: Date.now(), type: "info", category: "Sistem",
    message: `🎓 Sesi selesai — ${session.completedQuestions}/${session.totalQuestions} pertanyaan dijawab, +${session.totalXP} XP | Pool terpakai: ${usedHashes.size}/${getTotalPool()}` });

  logger.info("Groq session completed", { sessionId, completed: session.completedQuestions, totalXP: session.totalXP });
  return session;
}

// ─── Mode Continuous (ON/OFF tanpa batas sesi) ───────────────────────────────

export function isContinuousActive(): boolean { return continuousEnabled; }

export async function startContinuousMode(questionCount = 5): Promise<void> {
  if (continuousEnabled) return;
  continuousEnabled = true;
  persistedQuestionCount = questionCount;
  saveSettings();
  logger.info("Groq continuous learning started", { questionCount });

  void (async () => {
    let sessionCount = 0;
    while (continuousEnabled) {
      sessionCount++;
      logger.info(`Groq continuous: sesi ke-${sessionCount} dimulai`);
      try {
        await runGeminiSession(persistedQuestionCount);
      } catch (err) {
        logger.warn("Groq continuous session error", { error: String(err) });
        await new Promise(r => setTimeout(r, 5000));
      }
      if (continuousEnabled) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    logger.info("Groq continuous learning stopped");
  })();
}

export function stopContinuousMode(): void {
  continuousEnabled = false;
  saveSettings();
  logger.info("Groq continuous learning: stopping after current session finishes");
}

// ─── Auto Mode (interval terjadwal) ──────────────────────────────────────────

function scheduleNextAuto() {
  if (autoTimer) clearTimeout(autoTimer);
  const delayMs = autoIntervalMinutes * 60 * 1000;
  nextAutoAt = Date.now() + delayMs;
  autoTimer = setTimeout(async () => {
    if (!autoEnabled) return;
    try { await runGeminiSession(persistedQuestionCount); } catch (err) {
      logger.warn("Groq auto session error", { error: String(err) });
    }
    if (autoEnabled) scheduleNextAuto();
  }, delayMs);
}

export function startAutoLearning(intervalMinutes = 60): void {
  autoEnabled = true;
  autoIntervalMinutes = intervalMinutes;
  saveSettings();
  scheduleNextAuto();
  logger.info("Groq auto-learning enabled", { intervalMinutes });
}

export function stopAutoLearning(): void {
  autoEnabled = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  nextAutoAt = null;
  saveSettings();
  logger.info("Groq auto-learning disabled");
}

// ─── Auto-resume on startup ───────────────────────────────────────────────────

if (_saved.autoEnabled) {
  logger.info("Groq: melanjutkan auto mode dari sesi sebelumnya", { intervalMinutes: _saved.autoIntervalMinutes });
  startAutoLearning(_saved.autoIntervalMinutes);
}
if (_saved.continuousEnabled) {
  logger.info("Groq: melanjutkan continuous mode dari sesi sebelumnya");
  setTimeout(() => startContinuousMode(_saved.questionCount), 3000);
}

// ─── Status & Exports ─────────────────────────────────────────────────────────

export function getGeminiStatus(): GeminiStatus {
  return {
    hasApiKey: Boolean(GROQ_API_KEY),
    currentSession, lastSession, totalSessionsRun, totalXPEarned,
    autoEnabled, autoIntervalMinutes, nextAutoAt,
    continuousEnabled,
    provider: "Groq Cloud", model: GROQ_MODEL,
    questionCount: persistedQuestionCount,
    totalUniqueQuestionsPool: getTotalPool(),
    usedHashesCount: usedHashes.size,
  };
}

export function getSkillNeeds(): Array<{ skill: string; category: string; score: number }> {
  const brain = getBrainStats();
  return [
    { skill: "patternRecognition",     category: "Pola Chart",         score: brain.patternRecognition },
    { skill: "marketReading",          category: "Konsep Pasar",       score: brain.marketReading },
    { skill: "trendAnalysis",          category: "Indikator Teknikal", score: brain.trendAnalysis },
    { skill: "volumeAnalysis",         category: "Indikator Teknikal", score: brain.volumeAnalysis },
    { skill: "momentumReading",        category: "Indikator Teknikal", score: brain.momentumReading },
    { skill: "candlePsychology",       category: "Pola Chart",         score: brain.candlePsychology },
    { skill: "smartMoneyConceptSkill", category: "Smart Money",        score: brain.smartMoneyConceptSkill },
    { skill: "orderflowReading",       category: "Smart Money",        score: brain.orderflowReading },
    { skill: "riskManagement",         category: "Manajemen Risiko",   score: brain.riskManagement },
    { skill: "emotionalDiscipline",    category: "Psikologi Trading",  score: brain.emotionalDiscipline },
    { skill: "patience",               category: "Psikologi Trading",  score: brain.patience },
    { skill: "selectivity",            category: "Strategi",           score: brain.selectivity },
    { skill: "adaptiveIntelligence",   category: "Strategi",           score: brain.adaptiveIntelligence },
    { skill: "predictionAccuracy",     category: "Strategi",           score: brain.predictionAccuracy },
  ].sort((a, b) => a.score - b.score);
}

export function getAvailableTopics(): string[] {
  return [...new Set(Object.values(SKILL_TO_TOPICS).map(m => m.category))];
}

export function getTotalQuestions(): number {
  return getTotalPool();
}
