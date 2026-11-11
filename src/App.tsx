import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";

// Pages load on demand so the first visit only downloads the home page; the
// admin console alone is several hundred kB. A chunk that fails to load after a
// deploy (old tab, new file names) reloads the page once to pick up the new build.
const CHUNK_RELOAD_KEY = "chunk-reload";

function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (mod) => {
        try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* storage unavailable */ }
        return mod;
      },
      (error) => {
        let reloaded = true;
        try {
          reloaded = Boolean(sessionStorage.getItem(CHUNK_RELOAD_KEY));
          if (!reloaded) sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        } catch { /* storage unavailable: don't risk a reload loop */ }
        if (reloaded) throw error;
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
    )
  );
}

const Login = lazyPage(() => import("./pages/Login"));
const Signup = lazyPage(() => import("./pages/Signup"));
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"));
const Profile = lazyPage(() => import("./pages/Profile"));
const BadgePublic = lazyPage(() => import("./pages/BadgePublic"));
const BadgeVerify = lazyPage(() => import("./pages/BadgeVerify"));
const SkillSprint = lazyPage(() => import("./pages/SkillSprint"));
const Hackathons = lazyPage(() => import("./pages/Hackathons"));
const CollegeChamps = lazyPage(() => import("./pages/CollegeChamps"));
const CloudClubs = lazyPage(() => import("./pages/CloudClubs"));
const CommunitySpotlight = lazyPage(() => import("./pages/CommunitySpotlight"));
const Circles = lazyPage(() => import("./pages/Circles"));
const Store = lazyPage(() => import("./pages/Store"));
const Meetups = lazyPage(() => import("./pages/Meetups"));
const Leaderboard = lazyPage(() => import("./pages/Leaderboard"));
const Admin = lazyPage(() => import("./pages/Admin"));
const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const AWSEvents = lazyPage(() => import("./pages/AWSEvents"));
const SpeakerCodeOfConduct = lazyPage(() => import("./pages/SpeakerCodeOfConduct"));
const SpeakerInvite = lazyPage(() => import("./pages/SpeakerInvite"));
const Kironomics = lazyPage(() => import("./pages/Kironomics"));
const KiroUniversity = lazyPage(() => import("./pages/KiroUniversity"));
const KiroUnsubscribe = lazyPage(() => import("./pages/KiroUnsubscribe"));
const Nominate = lazyPage(() => import("./pages/Nominate"));
const Achievements = lazyPage(() => import("./pages/Achievements"));
const NotFound = lazyPage(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data instantly for 1 min before considering it stale.
      staleTime: 60 * 1000,
      // Keep unused cache around for 5 min so back-navigation is instant.
      gcTime: 5 * 60 * 1000,
      // Avoid refetch storms when users tab away and back.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Public badge page — no auth required, like Credly's /badges/{id}/public_url */}
            <Route path="/badges/:badgeId/:userSlug" element={<BadgePublic />} />
            {/* OB v2 verification page — public */}
            <Route path="/ob2/verify" element={<BadgeVerify />} />

            {/* Speaker Code of Conduct — public so it can be linked from the footer and emails */}
            <Route path="/speaker-code-of-conduct" element={<SpeakerCodeOfConduct />} />
            {/* Speaker invitation acceptance — public landing; accepting requires sign-in */}
            <Route path="/speaker-invite/:meetupId/:token" element={<SpeakerInvite />} />

            {/* Kironomics — public landing so anyone can view rankings & install instructions */}
            <Route path="/kironomics" element={<Kironomics />} />

            {/* Kiro University build-along. Deliberately PUBLIC: the rules,
                reward tiers and leaderboard are what get shared into WhatsApp
                and drive signups. Auth is required only to act (join, mint a
                setup code), handled inside the page. */}
            <Route path="/kiro" element={<KiroUniversity />} />
            {/* The "Stop these reminders" link in campaign reminder emails.
                Public: the signature in the link is the authorisation. */}
            <Route path="/kiro/unsubscribe" element={<KiroUnsubscribe />} />

            {/* AWS Community Awards 2026 nomination kit. Sign-in and the invite
                check happen inside the page, so the login link can return here. */}
            <Route path="/nominate" element={<Nominate />} />

            {/* Achievements — public showcase of awards, milestones & community highlights */}
            <Route path="/achievements" element={<Achievements />} />
            
            {/* Protected Routes */}
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/u/:slug" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/skill-sprint" element={
              <ProtectedRoute>
                <SkillSprint />
              </ProtectedRoute>
            } />
            <Route path="/skill-sprint/:sprintId" element={
              <ProtectedRoute>
                <SkillSprint />
              </ProtectedRoute>
            } />
            <Route path="/hackathons" element={
              <ProtectedRoute>
                <Hackathons />
              </ProtectedRoute>
            } />
            {/* Team invite emails link here with ?invite={token}&team={teamId} */}
            <Route path="/hackathons/:hackathonId" element={
              <ProtectedRoute>
                <Hackathons />
              </ProtectedRoute>
            } />
            <Route path="/college-champs" element={
              <ProtectedRoute>
                <CollegeChamps />
              </ProtectedRoute>
            } />
            <Route path="/cloud-clubs" element={
              <ProtectedRoute>
                <CloudClubs />
              </ProtectedRoute>
            } />
            <Route path="/community-spotlight" element={
              <ProtectedRoute>
                <CommunitySpotlight />
              </ProtectedRoute>
            } />
            <Route path="/circles" element={
              <ProtectedRoute>
                <Circles />
              </ProtectedRoute>
            } />
            <Route path="/store" element={
              <ProtectedRoute>
                <Store />
              </ProtectedRoute>
            } />
            <Route path="/meetups" element={
              <ProtectedRoute>
                <Meetups />
              </ProtectedRoute>
            } />
            <Route path="/leaderboard" element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/aws-events" element={
              <ProtectedRoute>
                <AWSEvents />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
