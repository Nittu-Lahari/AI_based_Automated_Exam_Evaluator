import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { MarksTable } from "@/components/MarksTable";

interface Result {
  id: string;
  exam_id: string;
  question_id: string;
  marks_obtained: number;
  feedback: string | null;
  exam_title: string;
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
  exam_id: string;
  student_label: string;
  roll_number: string;
  total_marks: number;
  max_marks: number;
  evaluation_data: QuestionEval[];
  created_at: string;
  exam_title?: string;
}

export default function StudentResults() {
  const { user, profile } = useAuth();
  const [results, setResults] = useState<Result[]>([]);
  const [offlineResults, setOfflineResults] = useState<OfflineResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOffline, setExpandedOffline] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      // Fetch online results
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("student_id", user.id)
        .eq("is_published", true);

      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }

      let onlineResults: Result[] = [];
      if (data && data.length > 0) {
        const examIds = [...new Set(data.map((r) => r.exam_id))];
        const qIds = [...new Set(data.map((r) => r.question_id))];
        const [examsRes, qRes] = await Promise.all([
          supabase.from("exams").select("id, title").in("id", examIds),
          supabase.from("questions").select("id, question_text, marks").in("id", qIds),
        ]);
        const eMap = Object.fromEntries((examsRes.data || []).map((e) => [e.id, e]));
        const qMap = Object.fromEntries((qRes.data || []).map((q) => [q.id, q]));
        onlineResults = data.map((r) => ({
          ...r,
          exam_title: eMap[r.exam_id]?.title || "Unknown",
          question_text: qMap[r.question_id]?.question_text || "",
          max_marks: qMap[r.question_id]?.marks || 10,
        }));
      }
      setResults(onlineResults);

      // Fetch offline results matching student name or roll number
      const studentName = profile?.full_name || "";
      const rollNumber = (profile as any)?.roll_number || "";

      let offlineData: OfflineResult[] = [];
      // Try matching by roll number first, then by name
      if (rollNumber) {
        const { data: rollRes } = await supabase
          .from("offline_results")
          .select("*")
          .ilike("roll_number", rollNumber);
        offlineData = (rollRes as unknown as OfflineResult[]) || [];
      }
      if (offlineData.length === 0 && studentName) {
        const { data: nameRes } = await supabase
          .from("offline_results")
          .select("*")
          .ilike("student_label", `%${studentName}%`);
        offlineData = (nameRes as unknown as OfflineResult[]) || [];
      }

      // Fetch exam titles for offline results
      if (offlineData.length > 0) {
        const oExamIds = [...new Set(offlineData.map((r) => r.exam_id))];
        const { data: oExams } = await supabase.from("exams").select("id, title").in("id", oExamIds);
        const oMap = Object.fromEntries((oExams || []).map((e) => [e.id, e.title]));
        offlineData = offlineData.map((r) => ({ ...r, exam_title: oMap[r.exam_id] || "Exam" }));
      }
      setOfflineResults(offlineData);
      setLoading(false);
    };
    fetchAll();
  }, [user, profile]);

  // Group online results by exam
  const groupedByExam: Record<string, { title: string; results: Result[] }> = {};
  results.forEach((r) => {
    if (!groupedByExam[r.exam_id]) groupedByExam[r.exam_id] = { title: r.exam_title, results: [] };
    groupedByExam[r.exam_id].results.push(r);
  });

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Results</h1>
          <p className="text-sm text-muted-foreground">View your evaluated exam results</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : Object.keys(groupedByExam).length === 0 && offlineResults.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No results published yet. Check back after your exams are evaluated.</CardContent></Card>
        ) : (
          <>
            {/* Online Exam Results */}
            {Object.entries(groupedByExam).map(([examId, group]) => {
              const total = group.results.reduce((s, r) => s + Number(r.marks_obtained), 0);
              const maxTotal = group.results.reduce((s, r) => s + r.max_marks, 0);
              const percentage = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
              return (
                <Card key={examId}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{group.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-warning" />
                        <span className="text-lg font-bold text-foreground">{total}/{maxTotal}</span>
                        <span className="text-sm text-muted-foreground">({percentage}%)</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Marks Summary Table */}
                    <MarksTable
                      studentName={profile?.full_name || ""}
                      rollNumber={(profile as any)?.roll_number || ""}
                      questions={group.results.map((r, i) => ({
                        question_number: i + 1,
                        marks_obtained: Number(r.marks_obtained),
                        max_marks: r.max_marks,
                      }))}
                      totalMarks={total}
                      maxMarks={maxTotal}
                    />
                    {/* Existing question + feedback details */}
                    <div className="space-y-3 border-t pt-4">
                      {group.results.map((r) => (
                        <div key={r.id} className="rounded-lg border bg-secondary/30 p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">Q: {r.question_text}</p>
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                              {r.marks_obtained}/{r.max_marks}
                            </span>
                          </div>
                          {r.feedback && (
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              <strong>Feedback:</strong>
                              <div className="whitespace-pre-line">{r.feedback}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Offline Evaluation Results */}
            {offlineResults.length > 0 && (
              <>
                <h2 className="text-xl font-bold text-foreground pt-4">Offline Evaluation Results</h2>
                {offlineResults.map((r) => {
                  const isExpanded = expandedOffline === r.id;
                  const evalData = (r.evaluation_data || []) as QuestionEval[];
                  const percentage = r.max_marks > 0 ? Math.round((r.total_marks / r.max_marks) * 100) : 0;
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-0">
                        <button
                          className="flex w-full items-center justify-between p-6 text-left"
                          onClick={() => setExpandedOffline(isExpanded ? null : r.id)}
                        >
                          <div>
                            <p className="text-base font-semibold text-foreground">{r.exam_title}</p>
                            <p className="text-sm text-muted-foreground">Roll No: {r.roll_number}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Trophy className="h-5 w-5 text-warning" />
                            <span className="text-lg font-bold text-foreground">{r.total_marks}/{r.max_marks}</span>
                            <span className="text-sm text-muted-foreground">({percentage}%)</span>
                            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
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
                                <div key={qi} className="rounded-lg border bg-secondary/30 p-4 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-foreground">Q{q.question_number}: {q.question_text}</p>
                                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                                      {q.marks_obtained}/{q.max_marks}
                                    </span>
                                  </div>
                                  {q.student_answer_summary && (
                                    <div className="text-sm text-muted-foreground">
                                      <strong>Answer:</strong>
                                      <div className="whitespace-pre-line mt-1">{q.student_answer_summary}</div>
                                    </div>
                                  )}
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Feedback:</strong>
                                    <div className="whitespace-pre-line mt-1">{q.feedback}</div>
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
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
