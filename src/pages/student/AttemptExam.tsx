import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, ArrowLeft } from "lucide-react";

interface Question {
  id: string;
  question_text: string;
  marks: number;
  question_order: number;
}

export default function AttemptExam() {
  const { examId } = useParams<{ examId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState<{ title: string; subject: string; duration_minutes: number; total_marks: number } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!examId || !user) return;
    const fetch = async () => {
      const [examRes, questionsRes, existingRes] = await Promise.all([
        supabase.from("exams").select("title, subject, duration_minutes, total_marks").eq("id", examId).single(),
        supabase.from("questions").select("id, question_text, marks, question_order").eq("exam_id", examId).order("question_order"),
        supabase.from("student_answers").select("question_id, answer_text").eq("exam_id", examId).eq("student_id", user.id),
      ]);

      if (examRes.error) {
        toast({ title: "Error", description: "Exam not found.", variant: "destructive" });
        navigate("/student/exams");
        return;
      }

      setExam(examRes.data);
      setQuestions(questionsRes.data || []);

      // Pre-fill existing answers
      const existing: Record<string, string> = {};
      (existingRes.data || []).forEach((a) => { existing[a.question_id] = a.answer_text; });
      setAnswers(existing);
      setLoading(false);
    };
    fetch();
  }, [examId, user]);

  const handleSubmit = async () => {
    if (!user || !examId) return;

    const unanswered = questions.filter((q) => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      toast({ title: "Incomplete", description: `Please answer all ${unanswered.length} remaining question(s).`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const toUpsert = questions.map((q) => ({
        student_id: user.id,
        question_id: q.id,
        exam_id: examId,
        answer_text: answers[q.id] || "",
      }));

      const { error } = await supabase.from("student_answers").upsert(toUpsert, { onConflict: "student_id,question_id" });
      if (error) throw error;

      toast({ title: "Answers Submitted!", description: "Your answers have been saved successfully." });
      navigate("/student/exams");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/student/exams")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{exam?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {exam?.subject} • {exam?.duration_minutes} min • {exam?.total_marks} marks
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Question {i + 1} <span className="text-sm font-normal text-muted-foreground">({q.marks} marks)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">{q.question_text}</p>
                <Textarea
                  placeholder="Type your answer here..."
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="min-h-[100px]"
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Submit All Answers
        </Button>
      </div>
    </DashboardLayout>
  );
}
