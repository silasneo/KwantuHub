import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import Home from "./pages/Home";
import MarketplacePage from "./pages/Marketplace";
import VendorDirectory from "./pages/VendorDirectory";
import ListingDetail from "./pages/ListingDetail";
import VendorStorefront from "./pages/VendorStorefront";
import BuyerAccount from "./pages/BuyerAccount";
import VendorPortal from "./pages/VendorPortal";
import VendorOnboarding from "./pages/VendorOnboarding";
import AdminDashboard from "./pages/AdminDashboard";
import UserProfile from "./pages/UserProfile";
import AboutPage from "./pages/About";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import { PrivacyPolicyPage, TermsOfServicePage } from "./pages/LegalPages";
import SupportPage from "./pages/SupportPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/marketplace" component={MarketplacePage} />
      <Route path="/vendors" component={VendorDirectory} />
      <Route path="/vendors/:slug" component={VendorStorefront} />
      <Route path="/storefronts/:slug" component={VendorStorefront} />
      <Route path="/listings/:slug" component={ListingDetail} />
      <Route path="/account" component={BuyerAccount} />
      <Route path="/profile" component={UserProfile} />
      <Route path="/vendor" component={VendorPortal} />
      <Route path="/vendor/onboarding" component={VendorOnboarding} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/about" component={AboutPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/support" component={SupportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
