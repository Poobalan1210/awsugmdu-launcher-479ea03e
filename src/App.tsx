import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import BadgePublic from "./pages/BadgePublic";
import BadgeVerify from "./pages/BadgeVerify";
import SkillSprint from "./pages/SkillSprint";
import CollegeChamps from "./pages/CollegeChamps";
import CloudClubs from "./pages/CloudClubs";
import CommunitySpotlight from "./pages/CommunitySpotlight";
import Circles from "./pages/Circles";
import Store from "./pages/Store";
import Meetups from "./pages/Meetups";
import Leaderboard from "./pages/Leaderboard";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import AWSEvents from "./pages/AWSEvents";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Public badge page — no auth required, like Credly's /badges/{id}/public_url */}
            <Route path="/badges/:badgeId/:userSlug" element={<BadgePublic />} />
            {/* OB v2 verification page — public */}
            <Route path="/ob2/verify" element={<BadgeVerify />} />
            
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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
