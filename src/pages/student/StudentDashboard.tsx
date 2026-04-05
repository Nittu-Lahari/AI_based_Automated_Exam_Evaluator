import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, BarChart3, ClipboardList, Loader2 } from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ availableExams: 0, attempted: 0, results: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [examsRes, answersRes, resultsRes] = await Promise.all([
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("is_published", true),
        supabase.from("student_answers").select("exam_id", { count: "exact" }).eq("student_id", user.id),
        supabase.from("results").select("id", { count: "exact", head: true }).eq("student_id", user.id).eq("is_published", true),
      ]);

      const attemptedExams = answersRes.data ? new Set(answersRes.data.map((a) => a.exam_id)).size : 0;

      setStats({
        availableExams: examsRes.count || 0,
        attempted: attemptedExams,
        results: resultsRes.count || 0,
      });
      setLoading(false);
    };
    fetch();
  }, [user]);

  const statCards = [
    { label: "Available Exams", value: stats.availableExams, icon: BookOpen, color: "text-primary" },
    { label: "Exams Attempted", value: stats.attempted, icon: ClipboardList, color: "text-accent" },
    { label: "Results Available", value: stats.results, icon: BarChart3, color: "text-success" },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Student Dashboard</h1>
          <p className="text-sm text-muted-foreground">View exams and your results</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {statCards.map((card) => (
              <div key={card.label} className="stat-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-3xl font-bold text-foreground">{card.value}</p>
                  </div>
                  <card.icon className={`h-8 w-8 ${card.color}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/student/exams">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <BookOpen className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Browse Exams</h3>
                  <p className="text-sm text-muted-foreground">View and attempt available exams</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/student/results">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-6">
                <BarChart3 className="h-8 w-8 text-success" />
                <div>
                  <h3 className="font-semibold text-foreground">My Results</h3>
                  <p className="text-sm text-muted-foreground">Check your evaluated exam results</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
