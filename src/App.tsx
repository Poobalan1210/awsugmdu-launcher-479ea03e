import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import SkillSprint from "./pages/SkillSprint";
import CollegeChamps from "./pages/CollegeChamps";
import CertificationCircle from "./pages/CertificationCircle";
import Store from "./pages/Store";
import Meetups from "./pages/Meetups";
import Admin from "./pages/Admin";
import SpeakerInvite from "./pages/SpeakerInvite";
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
            
            {/* Protected Routes */}
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/profile/:userId" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/skill-sprint" element={
              <ProtectedRoute>
                <SkillSprint />
              </ProtectedRoute>
            } />
            <Route path="/college-champs" element={
              <ProtectedRoute>
                <CollegeChamps />
              </ProtectedRoute>
            } />
            <Route path="/certification-circle" element={
              <ProtectedRoute>
                <CertificationCircle />
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
            <Route path="/admin" element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/speaker-invite/:inviteId" element={
              <ProtectedRoute>
                <SpeakerInvite />
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
