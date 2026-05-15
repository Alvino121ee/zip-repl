import React from "react";
import { Link, useLocation } from "wouter";
import { 
  BarChart2, 
  TrendingUp, 
  Activity, 
  Newspaper, 
  LineChart, 
  Menu,
  Bell,
  Search,
  Zap,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-4">
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] sm:w-[300px]">
              <div className="px-2 py-6">
                <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-8">
                  <Zap className="h-5 w-5 text-primary fill-primary" />
                  <span className="tracking-wide">VINZ <span className="text-primary">PREDICT</span></span>
                </Link>
                <nav className="flex flex-col gap-2">
                  <MobileNavItem href="/" icon={BarChart2}>Dashboard</MobileNavItem>
                  <MobileNavItem href="/crypto" icon={TrendingUp}>Crypto Market</MobileNavItem>
                  <MobileNavItem href="/stocks" icon={LineChart}>Stock Market</MobileNavItem>
                  <MobileNavItem href="/predictions" icon={Activity}>Predictions</MobileNavItem>
                  <MobileNavItem href="/news" icon={Newspaper}>News</MobileNavItem>
                  <MobileNavItem href="/trading" icon={Bot}>Auto Trading</MobileNavItem>
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <Zap className="h-5 w-5 text-primary fill-primary" />
            <span className="tracking-wide">VINZ <span className="text-primary">PREDICT</span></span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search assets..."
                className="h-9 w-full md:w-[300px] lg:w-[400px] pl-9 bg-muted/50 border-muted"
              />
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function MobileNavItem({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== '/' && location.startsWith(href));
  
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
