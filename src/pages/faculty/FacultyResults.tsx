import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Save, ChevronDown, ChevronUp } from "lucide-react";
import { MarksTable } from "@/components/MarksTable";

interface ResultRow {
  id: string;
  student_id: string;
  question_id: string;
  exam_id: string;
  marks_obtained: number;
  feedback: string | null;
  is_published: boolean;
  student_email: string;
  student_name: string;
  question_text: string;
  max_marks: number;
}

interface QuestionEval {
  question_number: number;
  question_text: string;
  student_answer_summary?: string;
  marks_obtained: number;
  max_marks: number;
  feedback: string;
}

interface OfflineResult {
  id: string;
  student_label: string;
  roll_number: string;
  total_marks: number;
  max_marks: number;
  evaluation_data: QuestionEval[];
  created_at: string;
}

export default function FacultyResults() {
  const { user } = useAuth();
  const [exams, setExams] = useState<{ id: string; title: string }[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [offlineResults, setOfflineResults] = useState<OfflineResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedOffline, setExpandedOffline] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("exams").select("id, title").eq("faculty_id", user.id).then(({ data }) => setExams(data || []));
  }, [user]);

  const fetchResults = async (examId: string) => {
    setLoading(true);

    // Fetch online results
    const { data, error } = await supabase.from("results").select("*").eq("exam_id", examId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setLoading(false); return; }

    let onlineResults: ResultRow[] = [];
    if (data && data.length > 0) {
      const qIds = [...new Set(data.map((r) => r.question_id))];
      const sIds = [...new Set(data.map((r) => r.student_id))];
      const [qRes, pRes] = await Promise.all([
        supabase.from("questions").select("id, question_text, marks").in("id", qIds),
        supabase.from("profiles").select("user_id, email, full_name").in("user_id", sIds),
      ]);
      const qMap = Object.fromEntries((qRes.data || []).map((q) => [q.id, q]));
      const pMap = Object.fromEntries((pRes.data || []).map((p) => [p.user_id, p]));
      onlineResults = data.map((r) => ({
        ...r,
        student_email: pMap[r.student_id]?.email || "Unknown",
        student_name: pMap[r.student_id]?.full_name || "Unknown Student",
        question_text: qMap[r.question_id]?.question_text || "",
        max_marks: qMap[r.question_id]?.marks || 10,
      }));
    }
    setResults(onlineResults);

    // Fetch offline results
    const { data: offData } = await supabase
      .from("offline_results")
      .select("*")
      .eq("exam_id", examId)
      .eq("faculty_id", user!.id)
      .order("created_at", { ascending: false });
    setOfflineResults((offData as unknown as OfflineResult[]) || []);

    setLoading(false);
  };

  const updateResult = (id: string, field: "marks_obtained" | "feedback", value: string | number) => {
    setResults(results.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      for (const r of results) {
        await supabase.from("results").update({ marks_obtained: r.marks_obtained, feedback: r.feedback }).eq("id", r.id);
      }
      toast({ title: "Changes Saved!", description: "Marks and feedback updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const publishResults = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("results").update({ is_published: true }).eq("exam_id", selectedExam);
      if (error) throw error;
      toast({ title: "Results Published!", description: "Students can now view their results." });
      fetchResults(selectedExam);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const allPublished = results.length > 0 && results.every((r) => r.is_published);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Review & Publish Results</h1>

        <Card>
          <CardContent className="p-6">
            <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); fetchResults(v); }}>
              <SelectTrigger><SelectValue placeholder="Select an exam..." /></SelectTrigger>
              <SelectContent>
                {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {loading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

        {!loading && selectedExam && results.length === 0 && offlineResults.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No results for this exam yet. Evaluate answers first.</CardContent></Card>
        )}

        {/* Online Results */}
        {results.length > 0 && (() => {
          // Group by student
          const byStudent: Record<string, ResultRow[]> = {};
          results.forEach((r) => {
            if (!byStudent[r.student_id]) byStudent[r.student_id] = [];
            byStudent[r.student_id].push(r);
          });
          return (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Online Exam Results</h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={saveChanges} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" /> Save Changes
                  </Button>
                  {!allPublished && (
                    <Button onClick={publishResults} disabled={saving}>
                      <Send className="mr-2 h-4 w-4" /> Publish Results
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-6">
                {Object.entries(byStudent).map(([studentId, studentResults]) => {
                  const total = studentResults.reduce((s, r) => s + Number(r.marks_obtained), 0);
                  const maxTotal = studentResults.reduce((s, r) => s + r.max_marks, 0);
                  return (
                    <Card key={studentId}>
                      <CardContent className="space-y-4 p-6">
                        {/* Marks Summary Table */}
                        <MarksTable
                          studentName={studentResults[0].student_name}
                          rollNumber={studentResults[0].student_email}
                          questions={studentResults.map((r, i) => ({
                            question_number: i + 1,
                            marks_obtained: Number(r.marks_obtained),
                            max_marks: r.max_marks,
                          }))}
                          totalMarks={total}
                          maxMarks={maxTotal}
                        />
                        {/* Existing question + feedback details */}
                        <div className="space-y-3 border-t pt-4">
                          {studentResults.map((r) => (
                            <div key={r.id} className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.is_published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {r.is_published ? "Published" : "Draft"}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground">Q: {r.question_text}</p>
                              <div className="grid gap-4 sm:grid-cols-4">
                                <div className="space-y-1">
                                  <label className="text-xs text-muted-foreground">Marks (/{r.max_marks})</label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={r.max_marks}
                                    value={r.marks_obtained}
                                    onChange={(e) => updateResult(r.id, "marks_obtained", parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="space-y-1 sm:col-span-3">
                                  <label className="text-xs text-muted-foreground">Feedback</label>
                                  <Textarea
                                    value={r.feedback || ""}
                                    onChange={(e) => updateResult(r.id, "feedback", e.target.value)}
                                    className="min-h-[100px]"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Offline Evaluation Results */}
        {offlineResults.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-foreground pt-4">Offline Evaluation Results</h2>
            <div className="space-y-4">
              {offlineResults.map((r) => {
                const isExpanded = expandedOffline === r.id;
                const evalData = (r.evaluation_data || []) as QuestionEval[];
                return (
                  <Card key={r.id}>
                    <CardContent className="p-0">
                      <button
                        className="flex w-full items-center justify-between p-6 text-left"
                        onClick={() => setExpandedOffline(isExpanded ? null : r.id)}
                      >
                        <div>
                          <p className="text-base font-semibold text-foreground">{r.student_label || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground">Roll No: {r.roll_number || "N/A"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-primary/10 px-4 py-1 text-lg font-bold text-primary">
                            {r.total_marks}/{r.max_marks}
                          </span>
                          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                        </div>
                      </button>
                      {isExpanded && evalData.length > 0 && (
                        <div className="border-t px-6 pb-6 pt-4 space-y-4">
                          {/* Marks Summary Table */}
                          <MarksTable
                            studentName={r.student_label}
                            rollNumber={r.roll_number}
                            questions={evalData.map((q) => ({
                              question_number: q.question_number,
                              marks_obtained: q.marks_obtained,
                              max_marks: q.max_marks,
                            }))}
                            totalMarks={r.total_marks}
                            maxMarks={r.max_marks}
                          />
                          {/* Existing question + feedback details */}
                          <div className="space-y-3 border-t pt-4">
                            {evalData.map((q, qi) => (
                              <div key={qi} className="rounded-lg border bg-secondary/20 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-foreground">Q{q.question_number}: {q.question_text}</p>
                                  <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                                    {q.marks_obtained}/{q.max_marks}
                                  </span>
                                </div>
                                {q.student_answer_summary && (
                                  <div className="rounded bg-muted/50 p-3">
                                    <p className="text-sm font-medium text-foreground mb-1">Student Answer:</p>
                                    <p className="text-sm text-muted-foreground whitespace-pre-line">{q.student_answer_summary}</p>
                                  </div>
                                )}
                                <div className="rounded bg-muted/50 p-3">
                                  <p className="text-sm font-medium text-foreground mb-1">Feedback:</p>
                                  <p className="text-sm text-muted-foreground whitespace-pre-line">{q.feedback}</p>
                                </div>
                              </div>
                            ))}
                          </div>
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
