import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import PasswordGate from "@/pages/PasswordGate";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Keywords from "./pages/Keywords";
import Favorites from "./pages/Favorites";
import ExcludeRules from "./pages/ExcludeRules";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/keywords"} component={Keywords} />
      <Route path={"/exclude-rules"} component={ExcludeRules} />
      <Route path={"/favorites"} component={Favorites} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <PasswordGate>
            <Router />
          </PasswordGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
