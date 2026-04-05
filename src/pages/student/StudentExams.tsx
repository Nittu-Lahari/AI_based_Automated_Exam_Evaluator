import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Clock, BookOpen, PenTool } from "lucide-react";

interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
}

export default function StudentExams() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<Exam[]>([]);
  const [attemptedExamIds, setAttemptedExamIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [examsRes, answersRes] = await Promise.all([
        supabase.from("exams").select("*").eq("is_published", true).order("created_at", { ascending: false }),
        supabase.from("student_answers").select("exam_id").eq("student_id", user.id),
      ]);

      if (examsRes.error) toast({ title: "Error", description: examsRes.error.message, variant: "destructive" });
      setExams(examsRes.data || []);
      setAttemptedExamIds(new Set((answersRes.data || []).map((a) => a.exam_id)));
      setLoading(false);
    };
    fetch();
  }, [user]);

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Available Exams</h1>
          <p className="text-sm text-muted-foreground">{exams.length} exam(s) available</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : exams.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No exams available right now. Check back later!</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {exams.map((exam) => {
              const attempted = attemptedExamIds.has(exam.id);
              return (
                <Card key={exam.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-foreground">{exam.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{exam.subject}</p>
                      {exam.description && <p className="mt-2 text-sm text-muted-foreground">{exam.description}</p>}
                    </div>
                    <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {exam.duration_minutes} min</span>
                      <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" /> {exam.total_marks} marks</span>
                    </div>
                    <Button
                      className="w-full"
                      variant={attempted ? "secondary" : "default"}
                      onClick={() => navigate(`/student/exam/${exam.id}`)}
                    >
                      <PenTool className="mr-2 h-4 w-4" />
                      {attempted ? "View / Update Answers" : "Attempt Exam"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
