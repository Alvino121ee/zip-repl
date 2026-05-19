import React from "react";
import { Link, useLocation } from "wouter";
import { 
  BarChart2, 
  TrendingUp, 
  Activity, 
  Newspaper, 
  LineChart,
  Bot,
  Timer,
  Sparkles,
  ShieldCheck,
  FlaskConical,
  Brain,
  TrendingDown,
  GraduationCap,
  Crosshair,
  Globe,
  Cpu,
  Zap,
} from "lucide-react";

export function Sidebar() {
  return (
    <aside className="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block md:w-64 border-r border-border bg-sidebar overflow-y-auto">
      <div className="flex h-full flex-col py-6 px-4">
        <nav className="flex flex-col gap-2">
          <NavItem href="/" icon={BarChart2}>Dashboard</NavItem>

          <div className="my-2" />
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Markets</div>
          <NavItem href="/crypto" icon={TrendingUp}>Crypto Market</NavItem>
          <NavItem href="/stocks" icon={LineChart}>Stock Market</NavItem>

          <div className="my-2" />
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Intelligence</div>
          <NavItem href="/predictions" icon={Activity}>Predictions</NavItem>
          <NavItem href="/prediction-locks" icon={ShieldCheck}>Prediction Locks</NavItem>
          <NavItem href="/news" icon={Newspaper}>News Feed</NavItem>

          <div className="my-2" />
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">AI</div>
          <NavItem href="/ai" icon={Sparkles}>KristalAI</NavItem>
          <NavItem href="/training-lab" icon={Brain} highlight>AI Training Center</NavItem>
          <NavItem href="/knowledge-learning" icon={GraduationCap} highlight>Sistem Belajar AI</NavItem>

          <div className="my-2" />
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Demo Trading</div>
          <NavItem href="/demo-trading" icon={FlaskConical}>Demo Crypto</NavItem>
          <NavItem href="/demo-forex" icon={Globe}>Demo Forex & Gold</NavItem>

          <div className="my-2" />
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Trading</div>
          <NavItem href="/trading" icon={Bot}>Auto Trading</NavItem>
          <NavItem href="/scalping5m" icon={Timer}>Scalping 5M</NavItem>
          <NavItem href="/full-margin-precision" icon={Crosshair} highlight>Full Margin Precision</NavItem>
          <NavItem href="/sl-analysis" icon={TrendingDown}>SL Analysis</NavItem>

          <div className="my-2" />
          <SectionLabel>Pro Trading</SectionLabel>
          <NavItem href="/forex-pro" icon={Globe} pro>
            Forex Pro Engine
          </NavItem>
          <NavItem href="/crypto-pro" icon={Cpu} pro>
            Crypto Pro Engine
          </NavItem>
        </nav>

        <div className="mt-auto pt-4 border-t border-border">
          <div className="px-2 py-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-orange-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-3 w-3 text-yellow-400" />
              <span className="text-[11px] font-bold text-white">Pro Trading Aktif</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Engine AI Forex + Crypto terpisah dengan analisis multi-layer SMC, pembelajaran otomatis, dan manajemen risiko canggih.</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 text-xs font-semibold tracking-wider uppercase mb-1 flex items-center gap-1.5">
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-orange-400">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-blue-500/30 to-orange-500/30" />
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  children,
  highlight = false,
  pro = false,
}: {
  href: string;
  icon: any;
  children: React.ReactNode;
  highlight?: boolean;
  pro?: boolean;
}) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : pro
          ? "text-blue-300 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40"
          : highlight
          ? "text-violet-400 hover:bg-violet-500/10 border border-violet-500/20"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <Icon className={`h-4 w-4 ${isActive ? "text-primary" : pro ? "text-blue-400" : highlight ? "text-violet-400" : "text-muted-foreground"}`} />
      {children}
      {pro && !isActive && (
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-orange-500/20 text-blue-300 font-semibold border border-blue-500/20">
          PRO
        </span>
      )}
      {highlight && !isActive && !pro && (
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold">AI</span>
      )}
    </Link>
  );
}
