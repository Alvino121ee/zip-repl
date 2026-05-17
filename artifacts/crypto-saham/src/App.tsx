import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "@/components/theme-provider";

// Components
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Dashboard from "@/pages/Dashboard";
import Crypto from "@/pages/Crypto";
import Stocks from "@/pages/Stocks";
import Predictions from "@/pages/Predictions";
import PredictionDetail from "@/pages/PredictionDetail";
import News from "@/pages/News";
import Trading from "@/pages/Trading";
import Scalping5M from "@/pages/Scalping5M";
import AI from "@/pages/AI";
import PredictionLocks from "@/pages/PredictionLocks";
import DemoTrading from "@/pages/DemoTrading";
import TrainingLab from "@/pages/TrainingLab";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/crypto" component={Crypto} />
        <Route path="/stocks" component={Stocks} />
        <Route path="/predictions" component={Predictions} />
        <Route path="/predictions/:assetType/:assetId" component={PredictionDetail} />
        <Route path="/news" component={News} />
        <Route path="/trading" component={Trading} />
        <Route path="/scalping5m" component={Scalping5M} />
        <Route path="/ai" component={AI} />
        <Route path="/prediction-locks" component={PredictionLocks} />
        <Route path="/demo-trading" component={DemoTrading} />
        <Route path="/training-lab" component={TrainingLab} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="crypto-saham-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
