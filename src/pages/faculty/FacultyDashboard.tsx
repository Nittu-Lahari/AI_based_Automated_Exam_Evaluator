import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle, Users, BarChart3, Loader2 } from "lucide-react";

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ exams: 0, questions: 0, submissions: 0, evaluated: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const [examsRes, questionsRes, submissionsRes, resultsRes] = await Promise.all([
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("faculty_id", user.id),
        supabase.from("questions").select("id, exam_id", { count: "exact", head: true }),
        supabase.from("student_answers").select("id", { count: "exact", head: true }),
        supabase.from("results").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        exams: examsRes.count || 0,
        questions: questionsRes.count || 0,
        submissions: submissionsRes.count || 0,
        evaluated: resultsRes.count || 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [user]);

  const statCards = [
    { label: "Total Exams", value: stats.exams, icon: FileText, color: "text-primary" },
    { label: "Questions", value: stats.questions, icon: PlusCircle, color: "text-accent" },
    { label: "Submissions", value: stats.submissions, icon: Users, color: "text-success" },
    { label: "Evaluated", value: stats.evaluated, icon: BarChart3, color: "text-warning" },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Faculty Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage your exams and evaluations</p>
          </div>
          <Link to="/faculty/create-exam">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Exam
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/faculty/create-exam" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create New Exam
                </Button>
              </Link>
              <Link to="/faculty/manage-exams" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" /> Manage Exams
                </Button>
              </Link>
              <Link to="/faculty/evaluate" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <BarChart3 className="mr-2 h-4 w-4" /> Evaluate Answers
                </Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. <strong>Create an Exam</strong> — Set title, subject, duration, and total marks.</p>
              <p>2. <strong>Add Questions</strong> — Add questions with model answers.</p>
              <p>3. <strong>Publish</strong> — Make the exam visible to students.</p>
              <p>4. <strong>Evaluate</strong> — Use AI to evaluate student answers.</p>
              <p>5. <strong>Review & Publish Results</strong> — Edit marks/feedback and publish.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
