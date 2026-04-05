import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { GraduationCap, ArrowRight } from "lucide-react";

export default function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(role === "faculty" ? "/faculty" : "/student", { replace: true });
    }
  }, [user, role, loading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="animate-fade-in text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl gradient-bg">
          <GraduationCap className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="mb-2 text-4xl font-extrabold text-foreground">
          AI Exam <span className="gradient-text">Evaluator</span>
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          An intelligent exam management system for colleges. Create exams, evaluate answers with AI, and publish results — all in one place.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={() => navigate("/login")}>
            Sign In <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/register")}>
            Create Account
          </Button>
        </div>
      </div>
    </div>
  );
}
