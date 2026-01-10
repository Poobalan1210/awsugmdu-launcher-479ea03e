import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/skill-sprint" element={<SkillSprint />} />
          <Route path="/college-champs" element={<CollegeChamps />} />
          <Route path="/certification-circle" element={<CertificationCircle />} />
          <Route path="/store" element={<Store />} />
          <Route path="/meetups" element={<Meetups />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/speaker-invite/:inviteId" element={<SpeakerInvite />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
