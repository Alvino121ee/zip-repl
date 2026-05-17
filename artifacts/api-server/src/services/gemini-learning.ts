/**
 * Gemini Learning Service
 * AI menganalisis skill sendiri, membuat pertanyaan dari kebutuhan,
 * mengirim ke Google Gemini, lalu menyimpan jawaban ke bank pengetahuan.
 */

import { logger } from "../lib/logger.js";
import { manualTrain } from "./ai-continuous-learning.js";
import { getBrainStats } from "./ai-continuous-learning.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
}

// ─── Peta Skill ke Kategori & Topik ─────────────────────────────────────────

const SKILL_TO_TOPICS: Record<string, { category: string; topics: string[] }> = {
  patternRecognition: {
    category: "Pola Chart",
    topics: [
      "pola candlestick reversal (Hammer, Doji, Engulfing, Pin Bar) beserta cara konfirmasinya",
      "pola chart continuation (Bull Flag, Pennant, Ascending Triangle) dan cara entry yang tepat",
      "cara mengenali fake breakout vs breakout asli menggunakan volume dan struktur harga",
      "pola Double Top, Double Bottom, Head and Shoulders dan cara mengukur target harganya",
      "cara membaca Inside Bar dan Outside Bar sebagai sinyal kelanjutan atau pembalikan tren",
    ],
  },
  marketReading: {
    category: "Konsep Pasar",
    topics: [
      "cara membaca market structure: Higher High, Higher Low, Lower High, Lower Low dengan benar",
      "pengaruh Bitcoin dominance terhadap altcoin dan cara memanfaatkan fase altcoin season",
      "cara membaca Fear & Greed Index untuk timing entry dan exit yang optimal",
      "konsep support dan resistance dinamis vs statis dan mana yang lebih reliable",
      "cara mengidentifikasi fase akumulasi, markup, distribusi, dan markdown di pasar crypto",
    ],
  },
  trendAnalysis: {
    category: "Indikator Teknikal",
    topics: [
      "strategi trading menggunakan EMA 9, 21, 50 untuk konfirmasi tren dan sinyal entry",
      "cara menggunakan MACD untuk mengidentifikasi momentum dan divergensi di crypto",
      "cara membaca Ichimoku Cloud sebagai sistem analisis tren lengkap",
      "penggunaan ADX (Average Directional Index) untuk mengukur kekuatan tren",
      "strategi crossover EMA dan cara menghindari false signal di pasar sideways",
    ],
  },
  volumeAnalysis: {
    category: "Indikator Teknikal",
    topics: [
      "cara membaca Volume Profile dan Point of Control (POC) untuk support/resistance kuat",
      "analisis On-Balance Volume (OBV) untuk konfirmasi tren dan divergensi",
      "cara menggunakan volume spike untuk mengkonfirmasi breakout yang valid",
      "konsep Volume Weighted Average Price (VWAP) dan cara tradingnya",
      "cara membaca Chaikin Money Flow (CMF) untuk mendeteksi tekanan beli/jual institusional",
    ],
  },
  momentumReading: {
    category: "Indikator Teknikal",
    topics: [
      "cara membaca divergensi RSI bullish dan bearish dengan contoh setup konkret",
      "strategi scalping menggunakan RSI di timeframe 5 menit dengan filter yang tepat",
      "penggunaan Stochastic Oscillator untuk entry di area oversold dan overbought",
      "cara menggunakan Momentum Indicator dan Rate of Change (ROC) dalam trading",
      "kombinasi RSI dan MACD untuk konfirmasi sinyal yang lebih akurat",
    ],
  },
  candlePsychology: {
    category: "Pola Chart",
    topics: [
      "psikologi di balik setiap jenis candlestick: apa yang terjadi antara buyer dan seller",
      "cara membaca Marubozu, Spinning Top, dan Long Shadow dalam konteks market sentiment",
      "pola Three White Soldiers dan Three Black Crows: cara identifikasi dan trading",
      "cara membaca candlestick di dekat level kunci untuk sinyal reversal yang kuat",
      "kombinasi pola candlestick dengan volume untuk meningkatkan akurasi sinyal",
    ],
  },
  smartMoneyConceptSkill: {
    category: "Smart Money",
    topics: [
      "cara mengidentifikasi Order Block institusional yang valid dan cara trading di sekitarnya",
      "konsep Liquidity Sweep: cara smart money mengambil likuiditas retail sebelum membalik",
      "perbedaan Break of Structure (BOS) dan Change of Character (CHOCH) dan cara tradingnya",
      "Fair Value Gap (FVG) dan imbalance: cara identifikasi dan memanfaatkan untuk entry",
      "Premium dan Discount Zone menggunakan Fibonacci: cara smart money selalu buy di discount",
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
    ],
  },
  riskManagement: {
    category: "Manajemen Risiko",
    topics: [
      "framework manajemen risiko lengkap: position sizing, stop loss, risk per trade, dan drawdown",
      "cara menghitung Risk/Reward Ratio optimal dan hubungannya dengan win rate minimum",
      "strategi Partial Take Profit: kapan ambil 50% di TP1 dan sisanya di TP2",
      "cara mengatur trailing stop loss berbasis ATR, struktur, atau persentase",
      "konsep Kelly Criterion dan cara menerapkannya untuk sizing posisi yang optimal",
    ],
  },
  emotionalDiscipline: {
    category: "Psikologi Trading",
    topics: [
      "cara mengatasi FOMO (Fear of Missing Out) dengan sistem aturan trading yang ketat",
      "bahaya revenge trading dan langkah konkret menghentikan siklus kerugian setelah loss besar",
      "cara membangun mindset trader profesional: cara melihat loss, ekspektasi, dan konsistensi",
      "teknik journaling trading yang efektif untuk mengidentifikasi pola kesalahan berulang",
      "cara mengelola emosi saat profit besar: menghindari overconfidence dan greedy",
    ],
  },
  patience: {
    category: "Psikologi Trading",
    topics: [
      "teknik menunggu setup yang sempurna dan menghindari overtrading",
      "cara membangun rutinitas trading harian yang disiplin dan konsisten",
      "strategi selective trading: cara memilih hanya setup dengan probabilitas tertinggi",
      "cara mengatur waktu trading yang efektif dan menghindari screen time berlebihan",
      "teknik mindfulness dan meditasi untuk meningkatkan fokus dan kesabaran dalam trading",
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
    ],
  },
  adaptiveIntelligence: {
    category: "Strategi",
    topics: [
      "cara beradaptasi strategi trading saat kondisi pasar berubah dari trending ke sideways",
      "perbedaan strategi trading saat market bullish, bearish, dan sideways",
      "cara membangun sistem trading yang adaptif berdasarkan volatilitas pasar (ATR)",
      "teknik backtesting manual dan otomatis untuk memvalidasi strategi trading",
      "cara mengoptimalkan parameter strategi tanpa overfitting ke data historis",
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
    ],
  },
};

// Pertanyaan fallback jika semua skill sudah cukup baik
const FALLBACK_TOPICS = [
  { category: "Strategi", topic: "strategi scalping crypto di timeframe 1-5 menit: jam terbaik, indikator, entry, exit, dan menghindari overtrading" },
  { category: "Manajemen Risiko", topic: "cara membangun sistem manajemen modal yang kokoh untuk trader full-time crypto" },
  { category: "Psikologi Trading", topic: "cara membangun mentalitas trader profesional yang konsisten dalam jangka panjang" },
  { category: "Smart Money", topic: "cara membaca institutional order flow dan memanfaatkan pergerakan smart money" },
  { category: "Konsep Pasar", topic: "analisis makro crypto: cara membaca siklus bull-bear dan rotasi sektor" },
];

// ─── Generate Pertanyaan dari Kebutuhan AI ───────────────────────────────────

function generateQuestionsFromNeeds(count: number): Array<{ category: string; question: string; skill: string }> {
  const brain = getBrainStats();

  // Ambil semua skill dan nilainya
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
  ];

  // Urutkan dari skill yang paling lemah
  skillScores.sort((a, b) => a.score - b.score);

  const questions: Array<{ category: string; question: string; skill: string }> = [];
  const usedTopics = new Set<string>();

  // Isi pertanyaan berdasarkan skill paling lemah
  for (let i = 0; i < skillScores.length && questions.length < count; i++) {
    const { skill, score } = skillScores[i];
    const mapping = SKILL_TO_TOPICS[skill];
    if (!mapping) continue;

    // Pilih topik acak yang belum dipakai
    const availableTopics = mapping.topics.filter(t => !usedTopics.has(t));
    if (availableTopics.length === 0) continue;

    const topicIndex = Math.floor(Math.random() * availableTopics.length);
    const topic = availableTopics[topicIndex];
    usedTopics.add(topic);

    questions.push({
      category: mapping.category,
      skill,
      question: `Jelaskan secara mendalam dan praktis tentang ${topic}. Berikan contoh konkret, kapan menerapkannya, dan kesalahan umum yang harus dihindari. Skor skill saat ini: ${score.toFixed(1)}%`,
    });
  }

  // Isi sisa dengan fallback jika kurang
  const fallbackIdx = Math.floor(Math.random() * FALLBACK_TOPICS.length);
  for (let fi = 0; questions.length < count; fi++) {
    const fb = FALLBACK_TOPICS[(fallbackIdx + fi) % FALLBACK_TOPICS.length];
    questions.push({
      category: fb.category,
      skill: "general",
      question: `Jelaskan secara mendalam dan praktis tentang ${fb.topic}. Sertakan contoh konkret, langkah-langkah eksekusi, dan hal-hal penting yang sering diabaikan trader pemula.`,
    });
  }

  return questions.slice(0, count);
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentSession: GeminiSession | null = null;
let lastSession: GeminiSession | null = null;
let totalSessionsRun = 0;
let totalXPEarned = 0;
let autoEnabled = false;
let autoIntervalMinutes = 60;
let nextAutoAt: number | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Gemini API Call ──────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diset");

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Kamu adalah expert trader profesional dengan pengalaman lebih dari 10 tahun di pasar crypto dan saham Indonesia (IDX).
Berikan jawaban yang mendalam, praktis, dan actionable dalam Bahasa Indonesia.
Fokus pada pengetahuan trading yang bisa langsung diterapkan oleh trader Indonesia.
Jawaban harus mencakup: penjelasan konsep, kapan/bagaimana menerapkannya, contoh konkret dengan angka spesifik, dan hal-hal yang harus dihindari.
Panjang jawaban: 4-6 paragraf yang padat, informatif, dan kaya detail teknikal.

${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.75,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1200,
    },
  };

  const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (data.error) throw new Error(data.error.message ?? "Unknown Gemini error");

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini mengembalikan jawaban kosong");
  return text.trim();
}

// ─── Session Runner ───────────────────────────────────────────────────────────

export async function runGeminiSession(questionCount = 5): Promise<GeminiSession> {
  if (currentSession?.status === "running") {
    throw new Error("Sesi Gemini sedang berjalan");
  }
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi");
  }

  // Generate pertanyaan dari kebutuhan AI berdasarkan skill yang lemah
  const questions = generateQuestionsFromNeeds(questionCount);

  const sessionId = `gemini-${Date.now()}`;
  const session: GeminiSession = {
    id: sessionId,
    startedAt: Date.now(),
    completedAt: null,
    totalQuestions: questionCount,
    completedQuestions: 0,
    totalXP: 0,
    log: [],
    status: "running",
  };
  currentSession = session;

  // Log info skill yang akan dipelajari
  const skillNames = questions.map(q => q.category).join(", ");
  session.log.push({
    timestamp: Date.now(),
    type: "info",
    category: "Sistem",
    message: `🧠 AI menganalisis skill & membuat ${questionCount} pertanyaan — Fokus: ${skillNames}`,
  });

  for (let i = 0; i < questions.length; i++) {
    const { category, question, skill } = questions[i];

    session.log.push({
      timestamp: Date.now(),
      type: "question",
      category,
      message: `❓ [${i + 1}/${questionCount}] [Skill: ${skill}] ${question.slice(0, 130)}...`,
    });

    try {
      const answer = await callGemini(question);

      session.log.push({
        timestamp: Date.now(),
        type: "answer",
        category,
        message: `✅ Gemini menjawab (${answer.length} karakter) — disimpan ke bank pengetahuan`,
      });

      const trainResult = manualTrain(answer);

      session.completedQuestions++;
      session.totalXP += trainResult.xpGained;

      session.log.push({
        timestamp: Date.now(),
        type: "save",
        category,
        message: `💾 Tersimpan — Grade ${trainResult.grade}, +${trainResult.xpGained} XP, Skill meningkat: ${trainResult.skillsImproved.map(s => s.label).join(", ") || "-"}`,
        xpGained: trainResult.xpGained,
        grade: trainResult.grade,
      });

      logger.info("Gemini answer saved to knowledge bank", {
        category,
        skill,
        grade: trainResult.grade,
        xp: trainResult.xpGained,
      });

      await new Promise(r => setTimeout(r, 1500));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      session.log.push({
        timestamp: Date.now(),
        type: "error",
        category,
        message: `❌ Error: ${msg}`,
      });
      logger.warn("Gemini session error on question", { category, skill, error: msg });
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  session.status = "completed";
  session.completedAt = Date.now();
  lastSession = { ...session };
  currentSession = null;
  totalSessionsRun++;
  totalXPEarned += session.totalXP;

  session.log.push({
    timestamp: Date.now(),
    type: "info",
    category: "Sistem",
    message: `🎓 Sesi selesai — ${session.completedQuestions}/${session.totalQuestions} pertanyaan dijawab, total +${session.totalXP} XP disimpan ke bank pengetahuan`,
  });

  logger.info("Gemini learning session completed", {
    sessionId,
    completed: session.completedQuestions,
    totalXP: session.totalXP,
  });

  return session;
}

// ─── Auto Mode ────────────────────────────────────────────────────────────────

function scheduleNextAuto() {
  if (autoTimer) clearTimeout(autoTimer);
  const delayMs = autoIntervalMinutes * 60 * 1000;
  nextAutoAt = Date.now() + delayMs;
  autoTimer = setTimeout(async () => {
    if (!autoEnabled) return;
    logger.info("Gemini auto-learning session triggered");
    try {
      await runGeminiSession(5);
    } catch (err) {
      logger.warn("Gemini auto session error", { error: String(err) });
    }
    if (autoEnabled) scheduleNextAuto();
  }, delayMs);
}

export function startAutoLearning(intervalMinutes = 60): void {
  autoEnabled = true;
  autoIntervalMinutes = intervalMinutes;
  scheduleNextAuto();
  logger.info("Gemini auto-learning enabled", { intervalMinutes });
}

export function stopAutoLearning(): void {
  autoEnabled = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  nextAutoAt = null;
  logger.info("Gemini auto-learning disabled");
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function getGeminiStatus(): GeminiStatus {
  return {
    hasApiKey: Boolean(GEMINI_API_KEY),
    currentSession,
    lastSession,
    totalSessionsRun,
    totalXPEarned,
    autoEnabled,
    autoIntervalMinutes,
    nextAutoAt,
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
  return Object.values(SKILL_TO_TOPICS).map(m => m.category).filter((v, i, a) => a.indexOf(v) === i);
}

export function getTotalQuestions(): number {
  return Object.values(SKILL_TO_TOPICS).reduce((sum, m) => sum + m.topics.length, 0);
}
