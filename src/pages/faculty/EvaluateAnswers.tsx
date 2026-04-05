import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Brain, CheckCircle } from "lucide-react";

interface ExamOption {
  id: string;
  title: string;
  subject: string;
}

interface AnswerWithQuestion {
  id: string;
  student_id: string;
  question_id: string;
  answer_text: string;
  question_text: string;
  model_answer: string;
  marks: number;
  student_email: string;
}

interface EvalResult {
  question_id: string;
  student_id: string;
  marks_obtained: number;
  feedback: string;
}

export default function EvaluateAnswers() {
  const { user } = useAuth();
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [answers, setAnswers] = useState<AnswerWithQuestion[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluated, setEvaluated] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("exams").select("id, title, subject").eq("faculty_id", user.id).then(({ data }) => {
      setExams(data || []);
    });
  }, [user]);

  const fetchAnswers = async (examId: string) => {
    setLoading(true);
    setEvaluated(false);
    setResults([]);

    const { data: answersData, error } = await supabase
      .from("student_answers")
      .select("id, student_id, question_id, answer_text")
      .eq("exam_id", examId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!answersData || answersData.length === 0) {
      setAnswers([]);
      setLoading(false);
      return;
    }

    // Fetch questions and profiles
    const questionIds = [...new Set(answersData.map((a) => a.question_id))];
    const studentIds = [...new Set(answersData.map((a) => a.student_id))];

    const [questionsRes, profilesRes] = await Promise.all([
      supabase.from("questions").select("id, question_text, model_answer, marks").in("id", questionIds),
      supabase.from("profiles").select("user_id, email, full_name").in("user_id", studentIds),
    ]);

    const questionsMap = Object.fromEntries((questionsRes.data || []).map((q) => [q.id, q]));
    const profilesMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));

    const enriched: AnswerWithQuestion[] = answersData.map((a) => ({
      ...a,
      question_text: questionsMap[a.question_id]?.question_text || "",
      model_answer: questionsMap[a.question_id]?.model_answer || "",
      marks: questionsMap[a.question_id]?.marks || 10,
      student_email: profilesMap[a.student_id]?.email || "Unknown",
      student_name: profilesMap[a.student_id]?.full_name || "Unknown Student",
    }));

    setAnswers(enriched);
    setLoading(false);
  };

  const handleEvaluate = async () => {
    if (answers.length === 0) return;
    setEvaluating(true);

    try {
      const { data, error } = await supabase.functions.invoke("evaluate-answers", {
        body: {
          exam_id: selectedExam,
          answers: answers.map((a) => ({
            student_id: a.student_id,
            question_id: a.question_id,
            answer_text: a.answer_text,
            model_answer: a.model_answer,
            max_marks: a.marks,
            question_text: a.question_text,
          })),
        },
      });

      if (error) throw error;

      setResults(data.results || []);
      setEvaluated(true);
      toast({ title: "Evaluation Complete!", description: `${data.results?.length || 0} answers evaluated by AI.` });
    } catch (error: any) {
      toast({ title: "Evaluation Failed", description: error.message, variant: "destructive" });
    } finally {
      setEvaluating(false);
    }
  };

  const handleSaveResults = async () => {
    if (results.length === 0) return;
    setLoading(true);

    try {
      const toUpsert = results.map((r) => ({
        student_id: r.student_id,
        question_id: r.question_id,
        exam_id: selectedExam,
        marks_obtained: r.marks_obtained,
        feedback: r.feedback,
        is_published: false,
      }));

      // Delete existing results for this exam first, then insert new ones
      await supabase.from("results").delete().eq("exam_id", selectedExam);
      const { error } = await supabase.from("results").insert(toUpsert);
      if (error) throw error;

      toast({ title: "Results Saved!", description: "Results saved. Go to Results page to review and publish." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Evaluate Student Answers</h1>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-foreground">Select Exam</label>
                <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); fetchAnswers(v); }}>
                  <SelectTrigger><SelectValue placeholder="Choose an exam..." /></SelectTrigger>
                  <SelectContent>
                    {exams.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.title} — {e.subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

        {!loading && selectedExam && answers.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No student submissions for this exam yet.</CardContent></Card>
        )}

        {!loading && answers.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{answers.length} answer(s) found</p>
              <div className="flex gap-2">
                <Button onClick={handleEvaluate} disabled={evaluating}>
                  {evaluating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                  {evaluating ? "Evaluating..." : "Evaluate with AI"}
                </Button>
                {evaluated && (
                  <Button variant="secondary" onClick={handleSaveResults} disabled={loading}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Save Results
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {answers.map((a, i) => {
                const result = results.find((r) => r.student_id === a.student_id && r.question_id === a.question_id);
                return (
                  <Card key={a.id}>
                    <CardContent className="space-y-3 p-6">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Student: {(a as any).student_name || a.student_email}</p>
                        {result && (
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                            {result.marks_obtained}/{a.marks}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Q: {a.question_text}</p>
                        <p className="mt-2 text-sm text-muted-foreground"><strong>Student Answer:</strong> {a.answer_text}</p>
                        <p className="mt-1 text-sm text-muted-foreground"><strong>Model Answer:</strong> {a.model_answer}</p>
                      </div>
                      {result && (
                        <div className="rounded-lg border bg-secondary/30 p-3">
                          <p className="text-sm font-medium text-foreground">AI Feedback:</p>
                          <p className="text-sm text-muted-foreground">{result.feedback}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
