/**
 * Gemini Learning Service
 * AI auto-generates trading questions, sends them to Google Gemini,
 * then saves answers into the knowledge bank via manualTrain().
 */

import { logger } from "../lib/logger.js";
import { manualTrain } from "./ai-continuous-learning.js";

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

// ─── Pertanyaan Trading per Kategori ─────────────────────────────────────────

const QUESTION_BANK: Array<{ category: string; question: string }> = [
  // Indikator Teknikal
  {
    category: "Indikator Teknikal",
    question:
      "Jelaskan secara mendalam bagaimana cara membaca divergensi RSI dalam konteks trading crypto. Berikan contoh konkret setup bullish divergence dan bearish divergence beserta cara eksekusinya.",
  },
  {
    category: "Indikator Teknikal",
    question:
      "Bagaimana cara menggunakan MACD secara optimal untuk scalping di timeframe 5 menit? Jelaskan kapan sinyal MACD valid dan kapan harus diabaikan berdasarkan kondisi pasar.",
  },
  {
    category: "Indikator Teknikal",
    question:
      "Jelaskan strategi trading menggunakan kombinasi EMA 9, 21, dan 50 untuk menentukan tren dan entry point. Bagaimana mengkonfirmasi sinyal crossover EMA agar tidak terjebak false signal?",
  },
  {
    category: "Indikator Teknikal",
    question:
      "Bagaimana cara menggunakan Bollinger Bands untuk mengidentifikasi volatilitas dan peluang entry? Jelaskan konsep Bollinger Band squeeze dan expansion dalam trading crypto.",
  },
  {
    category: "Indikator Teknikal",
    question:
      "Jelaskan cara membaca Volume Profile dan bagaimana Point of Control (POC) dan Value Area digunakan untuk menentukan level support/resistance yang kuat dalam trading.",
  },

  // Smart Money Concept
  {
    category: "Smart Money Concept",
    question:
      "Jelaskan secara detail konsep Order Block dalam Smart Money Concept (SMC). Bagaimana cara mengidentifikasi order block yang valid, membedakan bullish order block dari bearish order block, dan cara trading di sekitar level tersebut?",
  },
  {
    category: "Smart Money Concept",
    question:
      "Apa itu Liquidity Sweep dalam konteks Smart Money? Jelaskan bagaimana institusi mengambil likuiditas retail di bawah swing low dan di atas swing high sebelum membalikkan arah pasar. Berikan contoh konkret.",
  },
  {
    category: "Smart Money Concept",
    question:
      "Jelaskan perbedaan antara Break of Structure (BOS) dan Change of Character (CHOCH) dalam analisis Smart Money. Bagaimana cara menggunakannya untuk mengidentifikasi perubahan tren?",
  },
  {
    category: "Smart Money Concept",
    question:
      "Apa itu Fair Value Gap (FVG) atau imbalance dalam trading? Bagaimana cara mengidentifikasi FVG di chart, dan mengapa harga sering kembali mengisi gap tersebut? Jelaskan cara trading berdasarkan FVG.",
  },
  {
    category: "Smart Money Concept",
    question:
      "Jelaskan konsep Premium dan Discount Zone dalam Smart Money Concept. Bagaimana cara menggunakan Fibonacci retracement untuk menentukan area premium dan discount, serta mengapa smart money selalu buy di discount dan sell di premium?",
  },

  // Manajemen Risiko
  {
    category: "Manajemen Risiko",
    question:
      "Jelaskan framework manajemen risiko lengkap untuk trader crypto profesional. Meliputi: perhitungan position sizing, penempatan stop loss yang optimal, risk per trade ideal, dan cara melindungi modal saat drawdown.",
  },
  {
    category: "Manajemen Risiko",
    question:
      "Bagaimana cara menghitung Risk/Reward Ratio yang optimal untuk berbagai jenis setup trading? Kapan sebaiknya mengambil trade dengan RR 1:2 vs 1:3 vs 1:5? Jelaskan hubungan RR dengan win rate minimum yang dibutuhkan.",
  },
  {
    category: "Manajemen Risiko",
    question:
      "Jelaskan konsep Partial Take Profit (TP parsial) dan bagaimana strategi ini membantu memaksimalkan profit sekaligus melindungi posisi. Kapan sebaiknya mengambil 50% profit di TP1 dan sisanya di TP2?",
  },
  {
    category: "Manajemen Risiko",
    question:
      "Bagaimana cara mengatur trailing stop loss secara efektif agar tidak tercut prematur tapi tetap melindungi profit? Jelaskan berbagai teknik trailing SL: ATR-based, structure-based, dan percentage-based.",
  },

  // Psikologi Trading
  {
    category: "Psikologi Trading",
    question:
      "Jelaskan secara mendalam fenomena FOMO (Fear of Missing Out) dalam trading. Mengapa FOMO menjadi musuh utama trader, dan apa strategi konkret untuk mengatasi FOMO serta tetap trading dengan disiplin?",
  },
  {
    category: "Psikologi Trading",
    question:
      "Apa itu revenge trading dan mengapa sangat berbahaya? Bagaimana cara mendeteksi diri sendiri sedang revenge trading, dan langkah-langkah konkret yang harus diambil setelah mengalami loss besar untuk menghindari siklus kerugian?",
  },
  {
    category: "Psikologi Trading",
    question:
      "Jelaskan bagaimana mindset seorang trader profesional berbeda dari trader retail. Apa perbedaan dalam cara melihat loss, mengelola ekspektasi, dan membangun konsistensi jangka panjang?",
  },
  {
    category: "Psikologi Trading",
    question:
      "Bagaimana cara membangun trading journal yang efektif? Apa saja yang perlu dicatat, bagaimana menganalisis pola kesalahan berulang, dan bagaimana menggunakan journal untuk terus meningkatkan performa trading?",
  },

  // Pola Chart
  {
    category: "Pola Chart",
    question:
      "Jelaskan pola candlestick reversal yang paling reliable: Hammer, Shooting Star, Engulfing, Doji, dan Pin Bar. Bagaimana cara mengkonfirmasi setiap pola ini dengan volume dan konteks pasar sebelum entry?",
  },
  {
    category: "Pola Chart",
    question:
      "Apa itu Head and Shoulders pattern dan Inverse Head and Shoulders? Bagaimana cara mengukur target harga setelah breakout neckline, dan apa saja faktor yang membuat pola ini lebih valid?",
  },
  {
    category: "Pola Chart",
    question:
      "Jelaskan pola chart continuation seperti Bull Flag, Bear Flag, Ascending Triangle, dan Pennant. Bagaimana mengidentifikasi pola yang sedang forming dan kapan waktu terbaik untuk entry?",
  },

  // Strategi Scalping & Swing
  {
    category: "Strategi",
    question:
      "Jelaskan strategi scalping yang efektif untuk trading crypto di timeframe 1-5 menit. Meliputi: jam trading terbaik, indikator yang digunakan, cara entry dan exit, dan bagaimana menghindari overtrading saat scalping.",
  },
  {
    category: "Strategi",
    question:
      "Bagaimana membangun sistem swing trading crypto yang konsisten? Jelaskan cara memilih setup, menentukan entry di retracement, menempatkan SL di struktur pasar, dan mengelola trade selama beberapa hari.",
  },
  {
    category: "Strategi",
    question:
      "Jelaskan strategi multi-timeframe analysis (MTF) untuk trading. Bagaimana menggunakan timeframe tinggi (daily/4H) untuk menentukan bias, dan timeframe rendah (1H/15M) untuk entry yang presisi?",
  },

  // Analisis Pasar
  {
    category: "Konsep Pasar",
    question:
      "Bagaimana cara membaca market structure secara benar? Jelaskan konsep Higher High (HH), Higher Low (HL), Lower High (LH), Lower Low (LL) dan bagaimana perubahan market structure memberi sinyal perubahan tren.",
  },
  {
    category: "Konsep Pasar",
    question:
      "Jelaskan pengaruh Bitcoin dominance terhadap altcoin market. Kapan sebaiknya trading Bitcoin vs altcoin berdasarkan fase siklus pasar crypto (Bitcoin season vs Altcoin season)?",
  },
  {
    category: "Konsep Pasar",
    question:
      "Bagaimana cara membaca fear and greed index untuk membantu timing entry dan exit? Jelaskan kapan extreme fear menjadi peluang beli dan extreme greed menjadi sinyal kehati-hatian.",
  },
];

// ─── State ────────────────────────────────────────────────────────────────────

let currentSession: GeminiSession | null = null;
let lastSession: GeminiSession | null = null;
let totalSessionsRun = 0;
let totalXPEarned = 0;
let autoEnabled = false;
let autoIntervalMinutes = 60;
let nextAutoAt: number | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let questionIndex = 0;

// ─── Gemini API Call ──────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum diset");

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Kamu adalah expert trader profesional dengan pengalaman lebih dari 10 tahun di pasar crypto dan saham. 
Berikan jawaban yang mendalam, praktis, dan actionable dalam Bahasa Indonesia.
Fokus pada pengetahuan trading yang bisa langsung diterapkan.
Jawaban harus mencakup: penjelasan konsep, kapan/bagaimana menerapkannya, contoh konkret, dan hal-hal yang harus dihindari.
Panjang jawaban: 3-5 paragraf yang padat dan informatif.

PERTANYAAN: ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
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

function pickQuestions(count: number): Array<{ category: string; question: string }> {
  const selected: Array<{ category: string; question: string }> = [];
  const total = QUESTION_BANK.length;
  for (let i = 0; i < count; i++) {
    selected.push(QUESTION_BANK[questionIndex % total]);
    questionIndex = (questionIndex + 1) % total;
  }
  return selected;
}

export async function runGeminiSession(questionCount = 5): Promise<GeminiSession> {
  if (currentSession?.status === "running") {
    throw new Error("Sesi Gemini sedang berjalan");
  }
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi");
  }

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

  const questions = pickQuestions(questionCount);

  session.log.push({
    timestamp: Date.now(),
    type: "info",
    category: "Sistem",
    message: `🚀 Sesi Gemini dimulai — ${questionCount} pertanyaan akan diproses`,
  });

  for (let i = 0; i < questions.length; i++) {
    const { category, question } = questions[i];

    session.log.push({
      timestamp: Date.now(),
      type: "question",
      category,
      message: `❓ [${i + 1}/${questionCount}] ${question.slice(0, 120)}...`,
    });

    try {
      const answer = await callGemini(question);

      session.log.push({
        timestamp: Date.now(),
        type: "answer",
        category,
        message: `✅ Jawaban diterima (${answer.length} karakter)`,
      });

      const trainResult = manualTrain(answer);

      session.completedQuestions++;
      session.totalXP += trainResult.xpGained;

      session.log.push({
        timestamp: Date.now(),
        type: "save",
        category,
        message: `💾 Disimpan ke bank pengetahuan — Grade ${trainResult.grade}, +${trainResult.xpGained} XP`,
        xpGained: trainResult.xpGained,
        grade: trainResult.grade,
      });

      logger.info("Gemini answer saved to knowledge bank", {
        category,
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
      logger.warn("Gemini session error on question", { category, error: msg });
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
    message: `🎓 Sesi selesai — ${session.completedQuestions}/${session.totalQuestions} pertanyaan, total +${session.totalXP} XP`,
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

export function getAvailableTopics(): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const q of QUESTION_BANK) {
    if (!seen.has(q.category)) { seen.add(q.category); topics.push(q.category); }
  }
  return topics;
}

export function getTotalQuestions(): number {
  return QUESTION_BANK.length;
}
