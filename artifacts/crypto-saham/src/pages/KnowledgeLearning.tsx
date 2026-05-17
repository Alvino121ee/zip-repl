import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, BookOpen, Send, Sparkles, Zap, Shield, TrendingUp,
  BarChart2, Activity, Target, Eye, RefreshCw, CheckCircle2,
  Star, Trophy, Lightbulb, Database, Clock, Layers,
  ChevronRight, Award, Flame, GraduationCap, BrainCircuit,
  ArrowUpRight, MessageSquare, Tag, Network, Gauge, Swords,
  RotateCcw, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

type Grade = "S" | "A" | "B" | "C" | "D";
type AiLevel = "Pemula" | "Intermediate" | "Mahir" | "Expert" | "Institusional";

interface TrainResult {
  xpGained: number;
  conceptsFound: string[];
  categoriesHit: string[];
  skillsImproved: { skill: string; label: string }[];
  memorySaved: boolean;
  iqBefore: number;
  iqAfter: number;
  grade: Grade;
  analysis: string;
  feedback: string;
  knowledgeConnections: string[];
  qualityScore: number;
  detectedTopics: string[];
}

interface BrainStats {
  iq: number;
  level: AiLevel;
  experiencePoints: number;
  learningCycles: number;
  patternRecognition: number;
  marketReading: number;
  adaptiveIntelligence: number;
  emotionalDiscipline: number;
  riskManagement: number;
  trendAnalysis: number;
  volumeAnalysis: number;
  momentumReading: number;
  candlePsychology: number;
  orderflowReading: number;
  smartMoneyConceptSkill: number;
  patience: number;
  selectivity: number;
  predictionAccuracy: number;
  confidenceAccuracy: number;
}

interface KnowledgeEntry {
  id: string;
  timestamp: number;
  title: string;
  description: string;
  tags: string[];
  xpValue: number;
  category: string;
}

interface KnowledgeBank {
  [category: string]: KnowledgeEntry[];
}

interface GeminiLogEntry {
  timestamp: number;
  type: "question" | "answer" | "save" | "error" | "info";
  category: string;
  message: string;
  xpGained?: number;
  grade?: string;
}

interface GeminiSessionData {
  id: string;
  startedAt: number;
  completedAt: number | null;
  totalQuestions: number;
  completedQuestions: number;
  totalXP: number;
  log: GeminiLogEntry[];
  status: "idle" | "running" | "completed" | "error";
}

interface GeminiStatusData {
  hasApiKey: boolean;
  currentSession: GeminiSessionData | null;
  lastSession: GeminiSessionData | null;
  totalSessionsRun: number;
  totalXPEarned: number;
  autoEnabled: boolean;
  autoIntervalMinutes: number;
  nextAutoAt: number | null;
}

// ─── Konstanta ────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<AiLevel, { color: string; bg: string; border: string; icon: string; xpNext: number }> = {
  Pemula:        { color: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/30",   icon: "🌱", xpNext: 500 },
  Intermediate:  { color: "text-blue-400",    bg: "bg-blue-500/15",    border: "border-blue-500/30",    icon: "📈", xpNext: 2000 },
  Mahir:         { color: "text-violet-400",  bg: "bg-violet-500/15",  border: "border-violet-500/30",  icon: "🎯", xpNext: 6000 },
  Expert:        { color: "text-yellow-400",  bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  icon: "🏆", xpNext: 15000 },
  Institusional: { color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: "⚡", xpNext: 99999 },
};

const GRADE_CONFIG: Record<Grade, { color: string; bg: string; border: string; label: string; emoji: string }> = {
  S: { color: "text-yellow-300",  bg: "bg-yellow-500/15",  border: "border-yellow-400/50",  label: "Luar Biasa",   emoji: "🌟" },
  A: { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-400/50", label: "Sangat Bagus", emoji: "🔥" },
  B: { color: "text-blue-300",    bg: "bg-blue-500/15",    border: "border-blue-400/50",    label: "Bagus",        emoji: "💡" },
  C: { color: "text-orange-300",  bg: "bg-orange-500/15",  border: "border-orange-400/50",  label: "Cukup",        emoji: "📖" },
  D: { color: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/30",   label: "Perlu Detail", emoji: "🔍" },
};

const CONTOH_INPUT = [
  { label: "Breakout Palsu", text: "Volume yang melemah di dekat resistance sering menyebabkan fake breakout. Saya selalu tunggu konfirmasi candle close di atas resistance dengan volume minimal 1.5x rata-rata 20 periode sebelum entry." },
  { label: "Likuiditas SMC", text: "BTC sering melakukan manipulasi setelah liquidity sweep di bawah swing low terdekat. Smart money mengambil likuiditas retail sebelum membalikkan arah ke atas." },
  { label: "Psikologi FOMO", text: "FOMO menyebabkan entry terlambat dan exit yang buruk. Saya buat aturan: jika harga sudah bergerak lebih dari 3% dari setup ideal, SKIP dan tunggu opportunity berikutnya." },
  { label: "EMA + Volume", text: "Alignment EMA 9, 21, 50 searah dengan volume breakout meningkatkan probabilitas trade berhasil. Konfluens tiga faktor ini adalah setup paling reliable dalam scalping 15M." },
  { label: "Risk Management", text: "Saya tidak pernah risk lebih dari 1% per trade. Stop loss selalu dipasang di struktur pasar (di bawah swing low untuk long), bukan berdasarkan persentase acak." },
  { label: "Revenge Trading", text: "Setelah loss besar, emosi mendorong revenge trading yang memperburuk kerugian. Aturan saya: setelah 2 loss berturut-turut, berhenti trading hari itu dan evaluasi besok." },
  { label: "Order Block", text: "Order block institusional terbentuk di area konsolidasi sebelum pergerakan impulsif besar. Ketika harga kembali ke area ini, probabilitas bounce sangat tinggi karena smart money membeli ulang." },
  { label: "Scalping Tips", text: "Hindari scalping saat likuiditas rendah (jam 12-14 WIB untuk crypto). Spread melebar dan pergerakan harga tidak natural. Waktu terbaik adalah overlap session London-New York." },
];

const KATEGORI_ICONS: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  "Indikator Teknikal":   { icon: BarChart2,    color: "text-blue-400",    bg: "bg-blue-500/10" },
  "Pola Chart":           { icon: Activity,      color: "text-violet-400",  bg: "bg-violet-500/10" },
  "Konsep Pasar":         { icon: TrendingUp,    color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  "Manajemen Risiko":     { icon: Shield,        color: "text-emerald-400", bg: "bg-emerald-500/10" },
  "Psikologi Trading":    { icon: Brain,         color: "text-pink-400",    bg: "bg-pink-500/10" },
  "Strategi":             { icon: Target,        color: "text-orange-400",  bg: "bg-orange-500/10" },
  "Smart Money":          { icon: Swords,        color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  "Volatilitas":          { icon: Zap,           color: "text-red-400",     bg: "bg-red-500/10" },
  "Momentum":             { icon: Flame,         color: "text-amber-400",   bg: "bg-amber-500/10" },
  "Manajemen Trade":      { icon: Gauge,         color: "text-indigo-400",  bg: "bg-indigo-500/10" },
};

const SKILL_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  patternRecognition:      { label: "Kenali Pola",      icon: Eye,          color: "text-violet-400" },
  candlePsychology:        { label: "Psikologi Candle", icon: Layers,       color: "text-pink-400" },
  marketReading:           { label: "Baca Pasar",       icon: Activity,     color: "text-cyan-400" },
  riskManagement:          { label: "Manaj. Risiko",    icon: Shield,       color: "text-emerald-400" },
  emotionalDiscipline:     { label: "Disiplin Emosi",   icon: Brain,        color: "text-blue-400" },
  adaptiveIntelligence:    { label: "Adaptif AI",       icon: BrainCircuit, color: "text-violet-400" },
  trendAnalysis:           { label: "Analisis Tren",    icon: TrendingUp,   color: "text-green-400" },
  volumeAnalysis:          { label: "Analisis Volume",  icon: BarChart2,    color: "text-blue-400" },
  momentumReading:         { label: "Baca Momentum",    icon: Flame,        color: "text-orange-400" },
  smartMoneyConceptSkill:  { label: "Smart Money",      icon: Swords,       color: "text-yellow-400" },
  orderflowReading:        { label: "Orderflow",        icon: Zap,          color: "text-red-400" },
  patience:                { label: "Kesabaran",        icon: Clock,        color: "text-slate-400" },
  selectivity:             { label: "Selektivitas",     icon: Target,       color: "text-amber-400" },
  predictionAccuracy:      { label: "Akurasi Prediksi", icon: CheckCircle2, color: "text-emerald-400" },
};

function skillBar(v: number) {
  if (v >= 80) return "bg-emerald-400";
  if (v >= 65) return "bg-green-400";
  if (v >= 50) return "bg-yellow-400";
  if (v >= 35) return "bg-orange-400";
  return "bg-red-500";
}
function skillColor(v: number) {
  if (v >= 80) return "text-emerald-400";
  if (v >= 65) return "text-green-400";
  if (v >= 50) return "text-yellow-400";
  if (v >= 35) return "text-orange-400";
  return "text-red-400";
}

// ─── Komponen Kecil ────────────────────────────────────────────────────────────

function SkillRow({ skillKey, value }: { skillKey: string; value: number }) {
  const meta = SKILL_MAP[skillKey];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
          <span className="text-xs text-muted-foreground">{meta.label}</span>
        </div>
        <span className={`text-xs font-bold font-mono ${skillColor(value)}`}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${skillBar(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Halaman Utama ─────────────────────────────────────────────────────────────

export default function KnowledgeLearning() {
  const { toast } = useToast();

  const [brain, setBrain] = useState<BrainStats | null>(null);
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TrainResult | null>(null);
  const [history, setHistory] = useState<Array<{ text: string; result: TrainResult; timestamp: number }>>([]);
  const [knowledgeBank, setKnowledgeBank] = useState<KnowledgeBank>({});
  const [activeTab, setActiveTab] = useState<"input" | "bank" | "skill" | "panduan" | "gemini">("input");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showContoh, setShowContoh] = useState(false);
  const [totalKnowledge, setTotalKnowledge] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const geminiLogRef = useRef<HTMLDivElement>(null);

  const [geminiStatus, setGeminiStatus] = useState<GeminiStatusData | null>(null);
  const [geminiRunning, setGeminiRunning] = useState(false);
  const [geminiQuestionCount, setGeminiQuestionCount] = useState(5);
  const [geminiAutoInterval, setGeminiAutoInterval] = useState(60);

  const fetchBrain = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/training-lab/ai-brain`);
      if (r.ok) setBrain(await r.json());
    } catch {}
  }, []);

  const fetchKnowledgeBank = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/training-lab/knowledge-bank`);
      if (r.ok) {
        const data = await r.json();
        setKnowledgeBank(data.categories ?? {});
        setTotalKnowledge(data.total ?? 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchBrain();
    fetchKnowledgeBank();
  }, [fetchBrain, fetchKnowledgeBank]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchBrain();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchBrain]);

  const fetchGeminiStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/gemini-learning/status`);
      if (r.ok) setGeminiStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchGeminiStatus();
  }, [fetchGeminiStatus]);

  useEffect(() => {
    if (activeTab !== "gemini" && !geminiRunning) return;
    const interval = setInterval(fetchGeminiStatus, 2500);
    return () => clearInterval(interval);
  }, [activeTab, geminiRunning, fetchGeminiStatus]);

  useEffect(() => {
    if (geminiLogRef.current) {
      geminiLogRef.current.scrollTop = geminiLogRef.current.scrollHeight;
    }
  }, [geminiStatus?.currentSession?.log]);

  const handleGeminiSession = async () => {
    setGeminiRunning(true);
    try {
      const res = await fetch(`${API}/api/gemini-learning/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionCount: geminiQuestionCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sesi gagal");
      await Promise.all([fetchGeminiStatus(), fetchBrain(), fetchKnowledgeBank()]);
      toast({
        title: `🤖 Sesi Groq Selesai — +${data.session?.totalXP ?? 0} XP`,
        description: `${data.session?.completedQuestions ?? 0} pertanyaan dijawab & disimpan ke bank pengetahuan`,
      });
    } catch (err: unknown) {
      toast({ title: "Sesi Groq gagal", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGeminiRunning(false);
    }
  };

  const handleGeminiAutoToggle = async () => {
    const isEnabled = geminiStatus?.autoEnabled ?? false;
    try {
      const endpoint = isEnabled ? "/api/gemini-learning/auto/stop" : "/api/gemini-learning/auto/start";
      const body = isEnabled ? {} : { intervalMinutes: geminiAutoInterval };
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      await fetchGeminiStatus();
      toast({ title: isEnabled ? "Mode Otomatis Dinonaktifkan" : "Mode Otomatis Aktif", description: data.message });
    } catch {}
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (text.length < 10) {
      toast({ title: "Teks terlalu pendek", description: "Tuliskan minimal satu kalimat observasi atau strategi.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/training-lab/manual-train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Gagal");
      }
      const data: TrainResult = await res.json();
      setResult(data);
      setHistory(prev => [{ text, result: data, timestamp: Date.now() }, ...prev].slice(0, 20));
      setInputText("");
      await Promise.all([fetchBrain(), fetchKnowledgeBank()]);
      toast({
        title: `${GRADE_CONFIG[data.grade].emoji} Grade ${data.grade} — +${data.xpGained} XP`,
        description: data.categoriesHit.length > 0
          ? `Kategori: ${data.categoriesHit.join(", ")}`
          : "Pengetahuan berhasil diserap AI",
      });
    } catch (err: unknown) {
      toast({ title: "Gagal mengirim", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const insertContoh = (text: string) => {
    setInputText(text);
    setShowContoh(false);
    textareaRef.current?.focus();
  };

  const lvl = (brain?.level ?? "Pemula") as AiLevel;
  const lcfg = LEVEL_CONFIG[lvl];
  const xpNext = lcfg.xpNext;
  const xpPct = brain ? Math.min(100, (brain.experiencePoints / xpNext) * 100) : 0;

  const totalHistoryXP = history.reduce((sum, h) => sum + h.result.xpGained, 0);
  const avgGrade = history.length > 0
    ? (["S","A","B","C","D"].find(g => history.filter(h => h.result.grade === g).length >= history.length * 0.4) ?? "B")
    : "–";

  return (
    <div className="space-y-4 pb-8">

      {/* ════ HEADER ════ */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-900/30 via-slate-900 to-slate-900 p-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <GraduationCap className="w-7 h-7 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className="text-xl font-black text-white">Sistem Pembelajaran Pengetahuan & Pengalaman</h1>
              </div>
              <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                Ajarkan AI dari observasi trading, strategi, pelajaran, dan pengalaman langsung — AI akan menganalisis teks, mengekstrak pengetahuan, menyimpan ke memori, dan berkembang secara dinamis.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  {lcfg.icon} Level: {lvl}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  IQ <span className={`font-bold ${lcfg.color}`}>{brain?.iq ?? 87}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  XP <span className="font-bold text-yellow-400">{(brain?.experiencePoints ?? 0).toLocaleString()}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Bank <span className="font-bold text-emerald-400">{totalKnowledge}</span> pengetahuan
                </span>
              </div>
            </div>
          </div>

          {/* XP Bar */}
          <div className="min-w-[180px] space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Progres Level</span>
              <span className={lcfg.color}>{xpPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-1000" style={{ width: `${xpPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground text-right">
              {(brain?.experiencePoints ?? 0).toLocaleString()} / {xpNext.toLocaleString()} XP
            </div>
          </div>
        </div>
      </div>

      {/* ════ STAT ROW ════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total XP Sesi Ini", value: `+${totalHistoryXP}`, color: "text-yellow-400", icon: Star, sub: `${history.length} input dikirim` },
          { label: "Bank Pengetahuan", value: totalKnowledge, color: "text-emerald-400", icon: Database, sub: "tersimpan permanen" },
          { label: "IQ Kecerdasan AI", value: brain?.iq ?? 87, color: lcfg.color, icon: BrainCircuit, sub: lvl },
          { label: "Rata-rata Grade", value: avgGrade, color: avgGrade === "S" ? "text-yellow-400" : avgGrade === "A" ? "text-emerald-400" : "text-blue-400", icon: Award, sub: "kualitas input" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="border-slate-700/50">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ════ TABS ════ */}
      <div className="flex gap-0.5 border-b border-border overflow-x-auto">
        {([
          { key: "input",   label: "✏️ Input Pengetahuan" },
          { key: "bank",    label: "💾 Bank Pengetahuan", badge: totalKnowledge > 0 ? totalKnowledge : undefined },
          { key: "skill",   label: "📊 Evolusi Skill AI" },
          { key: "gemini",  label: "🤖 Groq AI", badge: geminiStatus?.autoEnabled ? "AUTO" : undefined },
          { key: "panduan", label: "📋 Panduan" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
            {tab.badge !== undefined && (
              <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          TAB: INPUT PENGETAHUAN
      ══════════════════════════════════════════════ */}
      {activeTab === "input" && (
        <div className="grid md:grid-cols-5 gap-4">

          {/* ── Panel Kiri: Input + Riwayat ── */}
          <div className="md:col-span-3 space-y-4">

            {/* Input Box */}
            <Card className="border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-violet-400" />
                  Input Pengetahuan Trading
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{inputText.length}/5000 karakter</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value.slice(0, 5000))}
                  placeholder="Tulis observasi, strategi, pelajaran, atau insight trading kamu di sini...

Contoh: Volume melemah di dekat resistance sering menghasilkan fake breakout. Saya selalu tunggu konfirmasi volume sebelum entry breakout..."
                  className="w-full h-44 bg-background border border-border rounded-xl p-4 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-muted-foreground/40 leading-relaxed"
                  onKeyDown={e => {
                    if (e.key === "Enter" && e.ctrlKey) handleSubmit();
                  }}
                />

                {/* Contoh Topik */}
                <div>
                  <button
                    onClick={() => setShowContoh(!showContoh)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                    Butuh inspirasi? Lihat contoh input
                    {showContoh ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showContoh && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {CONTOH_INPUT.map(c => (
                        <button
                          key={c.label}
                          onClick={() => insertContoh(c.text)}
                          className="text-left px-2.5 py-2 rounded-lg border border-border hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group"
                        >
                          <div className="text-[11px] font-semibold text-foreground group-hover:text-violet-400 transition-colors">{c.label}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{c.text.slice(0, 50)}...</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {["Volume lemah di resistance", "Fake breakout", "FOMO trap", "Liquidity sweep", "Order block bounce", "EMA alignment", "Stop loss management", "Revenge trading", "Smart money manipulation", "Confluence entry"].map(tag => (
                    <button
                      key={tag}
                      onClick={() => setInputText(prev => prev ? `${prev} ${tag}` : tag)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-violet-400 hover:border-violet-500/40 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold h-11"
                  onClick={handleSubmit}
                  disabled={isSubmitting || inputText.trim().length < 10}
                >
                  {isSubmitting ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />AI sedang menganalisis & belajar...</>
                  ) : (
                    <><Brain className="w-4 h-4 mr-2" />Ajarkan ke AI <span className="ml-2 text-xs opacity-70">(Ctrl+Enter)</span></>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Riwayat Sesi */}
            {history.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Riwayat Sesi
                    <span className="ml-auto text-[11px] text-muted-foreground font-normal">{history.length} input</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                  {history.map((h, i) => {
                    const gc = GRADE_CONFIG[h.result.grade];
                    return (
                      <div key={i} className={`rounded-lg border ${gc.border} ${gc.bg} p-2.5`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-foreground line-clamp-2 flex-1">{h.text}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-xs font-black ${gc.color}`}>{h.result.grade}</span>
                            <span className="text-[10px] text-yellow-400 font-bold">+{h.result.xpGained}XP</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(h.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {h.result.categoriesHit.slice(0, 2).map(c => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300">{c}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Panel Kanan: Hasil Analisis ── */}
          <div className="md:col-span-2 space-y-3">

            {/* Status AI */}
            <Card className={`border ${lcfg.border}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl ${lcfg.bg} flex items-center justify-center`}>
                      <BrainCircuit className={`w-5 h-5 ${lcfg.color}`} />
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${lcfg.color}`}>{lcfg.icon} {lvl}</div>
                      <div className="text-[10px] text-muted-foreground">Level AI Saat Ini</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-black ${lcfg.color}`}>{brain?.iq ?? 87}</div>
                    <div className="text-[10px] text-muted-foreground">AI IQ</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center py-1.5 rounded-lg bg-slate-800/60">
                    <div className="text-base font-black text-yellow-400">{(brain?.experiencePoints ?? 0).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Total XP</div>
                  </div>
                  <div className="text-center py-1.5 rounded-lg bg-slate-800/60">
                    <div className="text-base font-black text-emerald-400">{brain?.learningCycles ?? 0}</div>
                    <div className="text-[10px] text-muted-foreground">Siklus Belajar</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hasil Analisis */}
            {result ? (
              <Card className={`border-2 ${GRADE_CONFIG[result.grade].border} ${GRADE_CONFIG[result.grade].bg}`}>
                <CardContent className="p-4 space-y-3">

                  {/* Grade Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black border ${GRADE_CONFIG[result.grade].border} ${GRADE_CONFIG[result.grade].bg}`}>
                        {GRADE_CONFIG[result.grade].emoji}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-black ${GRADE_CONFIG[result.grade].color}`}>Grade {result.grade}</span>
                          <span className="text-sm text-muted-foreground">— {GRADE_CONFIG[result.grade].label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">Pengetahuan berhasil diserap</div>
                      </div>
                    </div>
                  </div>

                  {/* XP Gained */}
                  <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm font-semibold text-yellow-300">XP Diperoleh</span>
                    </div>
                    <span className="text-2xl font-black text-yellow-400">+{result.xpGained}</span>
                  </div>

                  {/* IQ Change */}
                  {result.iqAfter > result.iqBefore && (
                    <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-violet-400" />
                        <span className="text-sm text-violet-300">Peningkatan IQ</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{result.iqBefore}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-black text-violet-400">{result.iqAfter}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    </div>
                  )}

                  {/* Feedback */}
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-foreground leading-relaxed">{result.feedback}</p>
                  </div>

                  {/* Kategori Terdeteksi */}
                  {result.categoriesHit.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Kategori Pengetahuan:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.categoriesHit.map(c => {
                          const cfg = KATEGORI_ICONS[c];
                          const CatIcon = cfg?.icon ?? Tag;
                          return (
                            <span key={c} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${cfg?.bg ?? "bg-violet-500/10"} ${cfg?.color ?? "text-violet-400"}`}>
                              <CatIcon className="w-2.5 h-2.5" />{c}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Skill Meningkat */}
                  {result.skillsImproved.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Skill AI Meningkat:</p>
                      <div className="space-y-1">
                        {result.skillsImproved.slice(0, 4).map((s, i) => {
                          const meta = SKILL_MAP[s.skill];
                          const Icon2 = meta?.icon ?? Zap;
                          return (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <Icon2 className={`w-3 h-3 ${meta?.color ?? "text-violet-400"} shrink-0`} />
                              <span className={meta?.color ?? "text-violet-400"}>{meta?.label ?? s.label}</span>
                              <span className="ml-auto text-emerald-400 font-bold">↑ Meningkat</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Konsep Ditemukan */}
                  {result.conceptsFound.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                        Konsep Dipelajari ({result.conceptsFound.length}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {result.conceptsFound.slice(0, 10).map(c => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 bg-slate-700/60 text-slate-300 rounded font-mono">{c}</span>
                        ))}
                        {result.conceptsFound.length > 10 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{result.conceptsFound.length - 10} lainnya</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Knowledge Connections */}
                  {result.knowledgeConnections && result.knowledgeConnections.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Network className="w-3 h-3" />Koneksi Pengetahuan:
                      </p>
                      <div className="space-y-1">
                        {result.knowledgeConnections.slice(0, 3).map((conn, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[11px] text-cyan-400">
                            <ChevronRight className="w-3 h-3 shrink-0" />
                            {conn}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.memorySaved && (
                    <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[11px] text-emerald-400">Tersimpan permanen di Bank Pengetahuan AI</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-slate-700">
                <CardContent className="py-10 text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-7 h-7 text-violet-400 opacity-50" />
                  </div>
                  <p className="text-sm text-muted-foreground">Hasil analisis AI akan muncul di sini</p>
                  <p className="text-xs text-muted-foreground/60">Setiap konsep berharga menambah XP & meningkatkan skill AI</p>
                </CardContent>
              </Card>
            )}

            {/* Tips */}
            <Card className="bg-muted/10 border-slate-700/50">
              <CardContent className="p-3 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tips mendapat Grade S</p>
                {[
                  { icon: "📊", text: "Sebutkan indikator spesifik (RSI, MACD, EMA, Volume)" },
                  { icon: "🎯", text: "Jelaskan setup entry, exit, dan SL secara detail" },
                  { icon: "🛡️", text: "Sertakan aturan risk management (RR, posisi sizing)" },
                  { icon: "🧠", text: "Ceritakan aspek psikologi & emosi dalam trading" },
                  { icon: "🔗", text: "Hubungkan beberapa konsep sekaligus (confluens)" },
                  { icon: "📏", text: "Input lebih panjang & detail = XP lebih banyak" },
                ].map(tip => (
                  <div key={tip.text} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="shrink-0">{tip.icon}</span>
                    <span>{tip.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB: BANK PENGETAHUAN
      ══════════════════════════════════════════════ */}
      {activeTab === "bank" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold">Bank Pengetahuan AI</span>
              <span className="text-xs text-muted-foreground">— tersimpan permanen & terorganisir otomatis</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{totalKnowledge} total</span>
              <Button variant="outline" size="sm" onClick={fetchKnowledgeBank} className="h-7 text-xs">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {Object.keys(knowledgeBank).length === 0 ? (
            <Card className="border-dashed border-slate-700">
              <CardContent className="py-16 text-center space-y-2">
                <Database className="w-10 h-10 mx-auto text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">Bank pengetahuan masih kosong</p>
                <p className="text-xs text-muted-foreground/60">Mulai ajarkan AI dari tab "Input Pengetahuan" untuk membangun database</p>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("input")} className="mt-2">
                  Mulai Ajarkan AI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {Object.entries(knowledgeBank)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([category, entries]) => {
                  const cfg = KATEGORI_ICONS[category] ?? { icon: BookOpen, color: "text-violet-400", bg: "bg-violet-500/10" };
                  const CatIcon = cfg.icon;
                  const isExpanded = expandedCategory === category;
                  return (
                    <Card key={category} className="border-slate-700/50 overflow-hidden">
                      <button
                        className="w-full text-left"
                        onClick={() => setExpandedCategory(isExpanded ? null : category)}
                      >
                        <div className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                              <CatIcon className={`w-4.5 h-4.5 ${cfg.color}`} />
                            </div>
                            <div>
                              <div className={`text-sm font-semibold ${cfg.color}`}>{category}</div>
                              <div className="text-[11px] text-muted-foreground">{entries.length} pengetahuan tersimpan</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, entries.length) }).map((_, i) => (
                                <div key={i} className={`w-1.5 h-4 rounded-full ${cfg.bg} ${cfg.color.replace("text-", "bg-").replace("/400", "/60")}`} />
                              ))}
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border px-4 pb-3">
                          <div className="space-y-2 mt-3 max-h-64 overflow-y-auto">
                            {entries.slice(0, 20).map(entry => (
                              <div key={entry.id} className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
                                <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${cfg.color.replace("text-", "bg-")}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-foreground leading-relaxed">{entry.title}</p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">
                                      {new Date(entry.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    </span>
                                    <span className="text-[10px] text-yellow-500 font-bold">{entry.xpValue} XP</span>
                                    {entry.tags.slice(0, 2).map(tag => (
                                      <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">{tag}</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {entries.length > 20 && (
                              <p className="text-xs text-muted-foreground text-center py-2">+{entries.length - 20} pengetahuan lainnya...</p>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB: EVOLUSI SKILL AI
      ══════════════════════════════════════════════ */}
      {activeTab === "skill" && (
        <div className="space-y-4">

          {/* IQ Hero */}
          <Card className={`border ${lcfg.border} bg-gradient-to-br from-violet-900/20 to-transparent`}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-5">
                  <div>
                    <div className={`text-6xl font-black ${lcfg.color} tabular-nums`}>{brain?.iq ?? 87}</div>
                    <div className="text-sm text-muted-foreground mt-1">AI Intelligence Quotient</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${lcfg.color} mb-1`}>{lcfg.icon} {lvl}</div>
                    <div className="text-xs text-muted-foreground">{(brain?.experiencePoints ?? 0).toLocaleString()} XP total</div>
                    <div className="text-xs text-muted-foreground">{brain?.learningCycles ?? 0} siklus belajar selesai</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Akurasi Prediksi", value: brain?.predictionAccuracy ?? 41, color: skillColor(brain?.predictionAccuracy ?? 41) },
                    { label: "Baca Pasar",        value: brain?.marketReading ?? 42,      color: skillColor(brain?.marketReading ?? 42) },
                    { label: "Kenali Pola",       value: brain?.patternRecognition ?? 38, color: skillColor(brain?.patternRecognition ?? 38) },
                    { label: "Disiplin Emosi",    value: brain?.emotionalDiscipline ?? 55, color: skillColor(brain?.emotionalDiscipline ?? 55) },
                  ].map(s => (
                    <div key={s.label} className="text-center px-3 py-2 rounded-xl bg-slate-800/60">
                      <div className={`text-lg font-black ${s.color}`}>{s.value.toFixed(1)}%</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progres ke Level Berikutnya</span>
                  <span className={lcfg.color}>{xpPct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-1000" style={{ width: `${xpPct}%` }} />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className={lcfg.color}>{(brain?.experiencePoints ?? 0).toLocaleString()} XP</span>
                  <span className="text-muted-foreground">Target: {xpNext.toLocaleString()} XP</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skill Grid */}
          <div className="grid md:grid-cols-3 gap-4">

            {/* Skill Analisis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Skill Analisis Pasar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkillRow skillKey="patternRecognition"     value={brain?.patternRecognition ?? 38} />
                <SkillRow skillKey="marketReading"          value={brain?.marketReading ?? 42} />
                <SkillRow skillKey="trendAnalysis"          value={brain?.trendAnalysis ?? 40} />
                <SkillRow skillKey="volumeAnalysis"         value={brain?.volumeAnalysis ?? 35} />
                <SkillRow skillKey="momentumReading"        value={brain?.momentumReading ?? 38} />
                <SkillRow skillKey="candlePsychology"       value={brain?.candlePsychology ?? 32} />
                <SkillRow skillKey="smartMoneyConceptSkill" value={brain?.smartMoneyConceptSkill ?? 22} />
              </CardContent>
            </Card>

            {/* Skill Trading */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Skill Trading & Eksekusi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkillRow skillKey="riskManagement"      value={brain?.riskManagement ?? 50} />
                <SkillRow skillKey="adaptiveIntelligence" value={brain?.adaptiveIntelligence ?? 45} />
                <SkillRow skillKey="orderflowReading"    value={brain?.orderflowReading ?? 28} />
                <SkillRow skillKey="predictionAccuracy"  value={brain?.predictionAccuracy ?? 41} />
                <SkillRow skillKey="confidenceAccuracy"  value={brain?.confidenceAccuracy ?? 44} />
              </CardContent>
            </Card>

            {/* Kepribadian AI */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-yellow-400" />
                  Karakter & Kepribadian AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkillRow skillKey="emotionalDiscipline" value={brain?.emotionalDiscipline ?? 55} />
                <SkillRow skillKey="patience"            value={brain?.patience ?? 52} />
                <SkillRow skillKey="selectivity"         value={brain?.selectivity ?? 48} />

                <div className="pt-2 border-t border-border">
                  <p className="text-[11px] text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Jalur Evolusi</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(Object.entries(LEVEL_CONFIG) as [AiLevel, typeof LEVEL_CONFIG[AiLevel]][]).map(([lvlName, cfg], i, arr) => {
                      const isActive = lvlName === lvl;
                      return (
                        <React.Fragment key={lvlName}>
                          <div className={`flex flex-col items-center gap-0.5 ${isActive ? "opacity-100" : "opacity-40"}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border ${isActive ? cfg.border + " " + cfg.bg : "border-slate-700"}`}>
                              {cfg.icon}
                            </div>
                            <span className={`text-[8px] ${isActive ? cfg.color : "text-muted-foreground"}`}>{lvlName}</span>
                          </div>
                          {i < arr.length - 1 && <div className="h-0.5 w-4 bg-slate-700" />}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Kategori vs XP */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                Kontribusi Pengetahuan per Kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {Object.entries(knowledgeBank)
                  .sort(([, a], [, b]) => b.length - a.length)
                  .map(([cat, entries]) => {
                    const cfg = KATEGORI_ICONS[cat] ?? { icon: BookOpen, color: "text-violet-400", bg: "bg-violet-500/10" };
                    const CatIcon = cfg.icon;
                    const totalXP = entries.reduce((s, e) => s + e.xpValue, 0);
                    return (
                      <div key={cat} className={`rounded-xl p-3 ${cfg.bg} border border-transparent text-center`}>
                        <CatIcon className={`w-5 h-5 ${cfg.color} mx-auto mb-1.5`} />
                        <div className={`text-sm font-bold ${cfg.color}`}>{entries.length}</div>
                        <div className="text-[10px] text-muted-foreground">{cat}</div>
                        <div className="text-[10px] text-yellow-400 mt-0.5">{totalXP} XP</div>
                      </div>
                    );
                  })}
                {Object.keys(knowledgeBank).length === 0 && (
                  <div className="col-span-5 text-center py-8 text-muted-foreground text-sm">
                    Belum ada data — mulai ajarkan AI untuk melihat statistik
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB: GEMINI AI
      ══════════════════════════════════════════════ */}
      {activeTab === "gemini" && (
        <div className="space-y-4">

          {/* Status API Key */}
          {!geminiStatus?.hasApiKey && (
            <Card className="border-red-500/40 bg-red-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">GROQ_API_KEY belum dikonfigurasi</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tambahkan GROQ_API_KEY ke Secrets (Environment Variables) agar fitur ini aktif. Bisa didapat gratis di console.groq.com</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hero Card */}
          <Card className="border-violet-500/30 bg-gradient-to-br from-violet-900/20 via-slate-900 to-slate-900 overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                    <BrainCircuit className="w-7 h-7 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-lg font-black text-white mb-0.5">Belajar Otomatis dengan Groq AI</div>
                    <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
                      AI menganalisis skill yang paling lemah, membuat pertanyaan sendiri, bertanya ke Groq Cloud (Llama 3.3 70B),
                      lalu jawaban langsung disimpan ke Bank Pengetahuan untuk meningkatkan skill AI secara otomatis.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${geminiStatus?.hasApiKey ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
                        {geminiStatus?.hasApiKey ? "✓ API Terhubung" : "✗ API Tidak Aktif"}
                      </span>
                      {geminiStatus?.autoEnabled && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          ⚡ Auto Mode Aktif
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {geminiStatus?.totalSessionsRun ?? 0} sesi selesai · +{geminiStatus?.totalXPEarned ?? 0} XP total
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleGeminiSession}
                    disabled={geminiRunning || !geminiStatus?.hasApiKey || geminiStatus?.currentSession?.status === "running"}
                    className="bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    {geminiRunning || geminiStatus?.currentSession?.status === "running" ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sedang Belajar...</>
                    ) : (
                      <><Brain className="w-4 h-4 mr-2" />Mulai Sesi Belajar</>
                    )}
                  </Button>
                  <Button
                    onClick={handleGeminiAutoToggle}
                    variant={geminiStatus?.autoEnabled ? "destructive" : "outline"}
                    disabled={!geminiStatus?.hasApiKey}
                    size="sm"
                  >
                    {geminiStatus?.autoEnabled ? "Stop Auto" : "Auto Mode"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Konfigurasi Sesi */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-orange-400" />
                  Konfigurasi Sesi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Jumlah Pertanyaan per Sesi: <span className="text-orange-400 font-bold">{geminiQuestionCount}</span>
                  </label>
                  <input
                    type="range" min={1} max={15} value={geminiQuestionCount}
                    onChange={e => setGeminiQuestionCount(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>1 (cepat)</span><span>15 (menyeluruh)</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Interval Auto Mode: <span className="text-blue-400 font-bold">{geminiAutoInterval} menit</span>
                  </label>
                  <input
                    type="range" min={10} max={480} step={10} value={geminiAutoInterval}
                    onChange={e => setGeminiAutoInterval(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>10 menit</span><span>8 jam</span>
                  </div>
                </div>
                {geminiStatus?.nextAutoAt && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-blue-400" />
                    Sesi auto berikutnya: {new Date(geminiStatus.nextAutoAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
                <div className="pt-1 border-t border-border">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    🧠 AI akan otomatis menganalisis skill yang paling lemah dan membuat pertanyaan yang tepat sasaran. Tidak perlu memilih topik — sistem cerdas memilihkan yang terbaik.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Skill Needs Preview */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-red-400" />
                  Prioritas Belajar AI (Skill Terlemah)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Smart Money", key: "smartMoneyConceptSkill",  value: brain?.smartMoneyConceptSkill ?? 22,  color: "text-yellow-400" },
                  { label: "Orderflow",   key: "orderflowReading",        value: brain?.orderflowReading ?? 28,        color: "text-red-400" },
                  { label: "Replay Skor", key: "candlePsychology",        value: brain?.candlePsychology ?? 32,        color: "text-pink-400" },
                  { label: "Kenali Pola", key: "patternRecognition",      value: brain?.patternRecognition ?? 38,      color: "text-violet-400" },
                  { label: "Analisis Vol",key: "volumeAnalysis",          value: brain?.volumeAnalysis ?? 35,          color: "text-blue-400" },
                ].sort((a, b) => a.value - b.value).map(s => (
                  <div key={s.key} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className={`font-bold font-mono ${skillColor(s.value)}`}>{s.value.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${s.value < 35 ? "bg-red-500" : s.value < 50 ? "bg-orange-400" : "bg-yellow-400"}`}
                        style={{ width: `${s.value}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">
                  Groq akan difokuskan ke skill dengan nilai terendah terlebih dahulu.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Live Session Log */}
          {(geminiStatus?.currentSession || geminiStatus?.lastSession) && (() => {
            const session = geminiStatus.currentSession ?? geminiStatus.lastSession!;
            const isRunning = session.status === "running";
            return (
              <Card className={`border ${isRunning ? "border-violet-500/40" : "border-slate-700/50"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-violet-400" />
                    {isRunning ? "Sesi Sedang Berjalan..." : "Sesi Terakhir"}
                    {isRunning && <RefreshCw className="w-3 h-3 text-violet-400 animate-spin ml-1" />}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {session.completedQuestions}/{session.totalQuestions} pertanyaan · +{session.totalXP} XP
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div ref={geminiLogRef} className="h-56 overflow-y-auto space-y-1.5 font-mono text-[11px] bg-slate-950/50 rounded-lg p-3">
                    {session.log.map((entry, i) => (
                      <div key={i} className={`flex gap-2 leading-relaxed ${
                        entry.type === "error"    ? "text-red-400"     :
                        entry.type === "save"     ? "text-emerald-400" :
                        entry.type === "answer"   ? "text-blue-400"    :
                        entry.type === "question" ? "text-yellow-300"  :
                        "text-slate-400"
                      }`}>
                        <span className="text-slate-600 shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span className="break-all">{entry.message}</span>
                      </div>
                    ))}
                    {session.log.length === 0 && (
                      <div className="text-slate-600 italic">Log kosong — mulai sesi untuk melihat aktivitas...</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Cara Kerja */}
          <Card className="bg-muted/10 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                Bagaimana Sistem Bekerja
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-3">
                {[
                  { step: "1", title: "AI Analisis Diri", desc: "AI melihat semua skill dan menemukan yang paling lemah", icon: BrainCircuit, color: "text-violet-400 bg-violet-500/15" },
                  { step: "2", title: "Buat Pertanyaan", desc: "Pertanyaan mendalam dibuat spesifik per skill yang dibutuhkan", icon: MessageSquare, color: "text-yellow-400 bg-yellow-500/15" },
                  { step: "3", title: "Tanya Groq AI", desc: "Groq Cloud (Llama 3.3 70B) menjawab sebagai expert trader profesional", icon: Sparkles, color: "text-blue-400 bg-blue-500/15" },
                  { step: "4", title: "Simpan & Berkembang", desc: "Jawaban masuk ke bank pengetahuan, skill AI meningkat", icon: Database, color: "text-emerald-400 bg-emerald-500/15" },
                ].map(item => {
                  const Icon2 = item.icon;
                  return (
                    <div key={item.step} className="text-center space-y-2">
                      <div className={`w-10 h-10 rounded-xl mx-auto flex items-center justify-center ${item.color.split(" ")[1]}`}>
                        <Icon2 className={`w-5 h-5 ${item.color.split(" ")[0]}`} />
                      </div>
                      <div className="text-xs font-semibold">{item.step}. {item.title}</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TAB: PANDUAN
      ══════════════════════════════════════════════ */}
      {activeTab === "panduan" && (
        <div className="grid md:grid-cols-2 gap-4">

          {/* Cara Kerja */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-violet-400" />
                Cara Kerja Sistem Pembelajaran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { step: "1", title: "Tulis Pengetahuan", desc: "Ketik observasi, strategi, pelajaran, atau insight trading kamu di kotak input.", icon: BookOpen, color: "text-blue-400 bg-blue-500/15" },
                { step: "2", title: "AI Menganalisis", desc: "AI memindai teks dan mengekstrak konsep teknikal, pola, strategi, psikologi, dan manajemen risiko.", icon: Brain, color: "text-violet-400 bg-violet-500/15" },
                { step: "3", title: "Penilaian Kualitas", desc: "AI menilai kualitas input (Grade S-D) dan menghitung XP berdasarkan kedalaman & kompleksitas.", icon: Award, color: "text-yellow-400 bg-yellow-500/15" },
                { step: "4", title: "Simpan ke Memori", desc: "Pengetahuan disimpan permanen di Bank Pengetahuan AI, terorganisir per kategori.", icon: Database, color: "text-emerald-400 bg-emerald-500/15" },
                { step: "5", title: "Skill Berkembang", desc: "Skill AI yang relevan meningkat otomatis sesuai topik yang diajarkan. IQ & level naik secara organik.", icon: TrendingUp, color: "text-cyan-400 bg-cyan-500/15" },
              ].map(item => {
                const Icon2 = item.icon;
                return (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl ${item.color.split(" ")[1]} flex items-center justify-center shrink-0`}>
                      <Icon2 className={`w-4 h-4 ${item.color.split(" ")[0]}`} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{item.step}. {item.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Kategori Pengetahuan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                Kategori Pengetahuan AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { cat: "Indikator Teknikal", desc: "RSI, MACD, EMA, Bollinger, Volume, ATR, dll.", icon: BarChart2, color: "text-blue-400 bg-blue-500/10" },
                { cat: "Pola Chart",         desc: "Breakout, reversal, candlestick patterns, fake breakout.", icon: Activity, color: "text-violet-400 bg-violet-500/10" },
                { cat: "Konsep Pasar",       desc: "Support/resistance, tren, momentum, market structure.", icon: TrendingUp, color: "text-cyan-400 bg-cyan-500/10" },
                { cat: "Manajemen Risiko",   desc: "Stop loss, risk/reward, position sizing, drawdown.", icon: Shield, color: "text-emerald-400 bg-emerald-500/10" },
                { cat: "Psikologi Trading",  desc: "FOMO, disiplin, kesabaran, revenge trading, mindset.", icon: Brain, color: "text-pink-400 bg-pink-500/10" },
                { cat: "Strategi",           desc: "Scalping, swing trading, entry/exit, backtest.", icon: Target, color: "text-orange-400 bg-orange-500/10" },
                { cat: "Smart Money",        desc: "Order block, liquidity sweep, BOS, CHOCH, FVG.", icon: Swords, color: "text-yellow-400 bg-yellow-500/10" },
              ].map(c => {
                const Icon2 = c.icon;
                return (
                  <div key={c.cat} className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg ${c.color.split(" ")[1]} flex items-center justify-center shrink-0`}>
                      <Icon2 className={`w-3.5 h-3.5 ${c.color.split(" ")[0]}`} />
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${c.color.split(" ")[0]}`}>{c.cat}</div>
                      <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Sistem Grade */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                Sistem Grade & XP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["S","A","B","C","D"] as Grade[]).map(g => {
                const gc = GRADE_CONFIG[g];
                return (
                  <div key={g} className={`flex items-center gap-3 p-2.5 rounded-lg border ${gc.border} ${gc.bg}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg font-black ${gc.bg} ${gc.color}`}>
                      {g}
                    </div>
                    <div className="flex-1">
                      <div className={`text-xs font-semibold ${gc.color}`}>{gc.emoji} Grade {g} — {gc.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {g === "S" && "≥60 XP — Input sangat kaya, mencakup banyak kategori & detail"}
                        {g === "A" && "≥40 XP — Input berkualitas tinggi dengan konsep trading jelas"}
                        {g === "B" && "≥25 XP — Input bagus dengan beberapa konsep spesifik"}
                        {g === "C" && "≥12 XP — Input cukup, perlu lebih banyak detail konkret"}
                        {g === "D" && "<12 XP — Input terlalu umum, tambahkan konsep & detail spesifik"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Skill yang dipengaruhi */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                Koneksi Topik → Skill AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { topic: "Breakout, fake breakout, pola",     skill: "Kenali Pola ↑, Baca Pasar ↑" },
                { topic: "Liquidity sweep, order block, SMC", skill: "Smart Money ↑, Baca Pasar ↑" },
                { topic: "Stop loss, risk reward, posisi",    skill: "Manaj. Risiko ↑, Disiplin ↑" },
                { topic: "FOMO, revenge trading, psikologi",  skill: "Disiplin Emosi ↑, Kesabaran ↑" },
                { topic: "RSI, MACD, EMA, volume",            skill: "Analisis Volume ↑, Kenali Pola ↑" },
                { topic: "Scalping, swing, day trading",      skill: "Adaptif AI ↑, Selektivitas ↑" },
                { topic: "Tren, momentum, struktur pasar",    skill: "Analisis Tren ↑, Momentum ↑" },
              ].map(c => (
                <div key={c.topic} className="flex items-start gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-foreground font-medium">{c.topic}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="text-emerald-400">{c.skill}</span>
                  </div>
                </div>
              ))}

              <div className="pt-2 border-t border-border flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  AI menolak input yang tidak logis atau berbahaya. Pastikan strategi yang diajarkan realistis dan berbasis analisis pasar yang valid.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
