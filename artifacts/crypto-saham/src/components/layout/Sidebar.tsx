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
          <div className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Trading</div>
          <NavItem href="/trading" icon={Bot}>Auto Trading</NavItem>
          <NavItem href="/scalping5m" icon={Timer}>Scalping 5M</NavItem>
          <NavItem href="/demo-trading" icon={FlaskConical}>Demo Trading</NavItem>
          <NavItem href="/full-margin-precision" icon={Crosshair} highlight>Full Margin Precision</NavItem>
          <NavItem href="/sl-analysis" icon={TrendingDown}>SL Analysis</NavItem>
        </nav>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon: Icon,
  children,
  highlight = false,
}: {
  href: string;
  icon: any;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : highlight
          ? "text-violet-400 hover:bg-violet-500/10 border border-violet-500/20"
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <Icon className={`h-4 w-4 ${isActive ? "text-primary" : highlight ? "text-violet-400" : "text-muted-foreground"}`} />
      {children}
      {highlight && !isActive && (
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-semibold">AI</span>
      )}
    </Link>
  );
}
