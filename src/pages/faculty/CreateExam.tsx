import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

interface QuestionForm {
  question_text: string;
  model_answer: string;
  marks: number;
}

export default function CreateExam() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [exam, setExam] = useState({
    title: "",
    description: "",
    subject: "",
    duration_minutes: 60,
    total_marks: 100,
  });
  const [questions, setQuestions] = useState<QuestionForm[]>([
    { question_text: "", model_answer: "", marks: 10 },
  ]);

  const addQuestion = () => {
    setQuestions([...questions, { question_text: "", model_answer: "", marks: 10 }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof QuestionForm, value: string | number) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!exam.title.trim() || !exam.subject.trim()) {
      toast({ title: "Error", description: "Title and subject are required.", variant: "destructive" });
      return;
    }

    const hasEmptyQuestions = questions.some((q) => !q.question_text.trim());
    if (hasEmptyQuestions) {
      toast({ title: "Error", description: "All questions must have text.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: examData, error: examError } = await supabase
        .from("exams")
        .insert({ ...exam, faculty_id: user.id })
        .select()
        .single();

      if (examError) throw examError;

      const questionsToInsert = questions.map((q, i) => ({
        exam_id: examData.id,
        question_text: q.question_text,
        model_answer: q.model_answer,
        marks: q.marks,
        question_order: i + 1,
      }));

      const { error: qError } = await supabase.from("questions").insert(questionsToInsert);
      if (qError) throw qError;

      toast({ title: "Exam Created!", description: `"${exam.title}" has been created with ${questions.length} questions.` });
      navigate("/faculty/manage-exams");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Create New Exam</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Exam Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} placeholder="Midterm Exam" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input id="subject" value={exam.subject} onChange={(e) => setExam({ ...exam, subject: e.target.value })} placeholder="Computer Science" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={exam.description} onChange={(e) => setExam({ ...exam, description: e.target.value })} placeholder="Brief description of the exam..." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input id="duration" type="number" min={1} value={exam.duration_minutes} onChange={(e) => setExam({ ...exam, duration_minutes: parseInt(e.target.value) || 60 })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marks">Total Marks</Label>
                  <Input id="marks" type="number" min={1} value={exam.total_marks} onChange={(e) => setExam({ ...exam, total_marks: parseInt(e.target.value) || 100 })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Questions ({questions.length})</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                  <Plus className="mr-1 h-4 w-4" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {questions.map((q, i) => (
                <div key={i} className="space-y-3 rounded-lg border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Question {i + 1}</Label>
                    {questions.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={q.question_text}
                    onChange={(e) => updateQuestion(i, "question_text", e.target.value)}
                    placeholder="Enter the question..."
                    required
                  />
                  <Textarea
                    value={q.model_answer}
                    onChange={(e) => updateQuestion(i, "model_answer", e.target.value)}
                    placeholder="Model answer (used for AI evaluation)..."
                  />
                  <div className="w-32">
                    <Label className="text-xs">Marks</Label>
                    <Input
                      type="number"
                      min={1}
                      value={q.marks}
                      onChange={(e) => updateQuestion(i, "marks", parseInt(e.target.value) || 10)}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Create Exam & Save Questions
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
