import React from "react";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopNav />
      <div className="flex flex-1 container max-w-7xl mx-auto px-4 md:px-8">
        <Sidebar />
        <main className="flex-1 w-full py-6 md:pl-6 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}