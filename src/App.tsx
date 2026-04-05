import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

import FacultyDashboard from "./pages/faculty/FacultyDashboard";
import CreateExam from "./pages/faculty/CreateExam";
import ManageExams from "./pages/faculty/ManageExams";
import EvaluateAnswers from "./pages/faculty/EvaluateAnswers";
import FacultyResults from "./pages/faculty/FacultyResults";
import OfflineEvaluation from "./pages/faculty/OfflineEvaluation";

import StudentDashboard from "./pages/student/StudentDashboard";
import StudentExams from "./pages/student/StudentExams";
import AttemptExam from "./pages/student/AttemptExam";
import StudentResults from "./pages/student/StudentResults";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Faculty Routes */}
            <Route path="/faculty" element={<ProtectedRoute requiredRole="faculty"><FacultyDashboard /></ProtectedRoute>} />
            <Route path="/faculty/create-exam" element={<ProtectedRoute requiredRole="faculty"><CreateExam /></ProtectedRoute>} />
            <Route path="/faculty/manage-exams" element={<ProtectedRoute requiredRole="faculty"><ManageExams /></ProtectedRoute>} />
            <Route path="/faculty/offline" element={<ProtectedRoute requiredRole="faculty"><OfflineEvaluation /></ProtectedRoute>} />
            <Route path="/faculty/evaluate" element={<ProtectedRoute requiredRole="faculty"><EvaluateAnswers /></ProtectedRoute>} />
            <Route path="/faculty/results" element={<ProtectedRoute requiredRole="faculty"><FacultyResults /></ProtectedRoute>} />

            {/* Student Routes */}
            <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
            <Route path="/student/exams" element={<ProtectedRoute requiredRole="student"><StudentExams /></ProtectedRoute>} />
            <Route path="/student/exam/:examId" element={<ProtectedRoute requiredRole="student"><AttemptExam /></ProtectedRoute>} />
            <Route path="/student/results" element={<ProtectedRoute requiredRole="student"><StudentResults /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
