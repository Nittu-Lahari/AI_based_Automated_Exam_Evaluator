import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, Trash2, Brain, Eye, ChevronDown, ChevronUp } from "lucide-react";

interface UploadedFile {
  id: string;
  file_type: string;
  original_name: string;
  student_label: string;
  file_path: string;
  created_at: string;
}

interface QuestionEval {
  question_number: number;
  question_text: string;
  student_answer_summary?: string;
  marks_obtained: number;
  max_marks: number;
  feedback: string;
}

interface EvalResult {
  student_name: string;
  roll_number: string;
  total_marks: number;
  max_marks: number;
  questions: QuestionEval[];
  file_name: string;
  error?: string;
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

export default function OfflineEvaluation() {
  const { user } = useAuth();
  const [exams, setExams] = useState<{ id: string; title: string }[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResults, setEvalResults] = useState<EvalResult[]>([]);
  const [savedResults, setSavedResults] = useState<OfflineResult[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("exams").select("id, title").eq("faculty_id", user.id).then(({ data }) => setExams(data || []));
  }, [user]);

  const fetchUploads = async (examId: string) => {
    setLoading(true);
    const [uploadsRes, resultsRes] = await Promise.all([
      supabase.from("offline_uploads").select("*").eq("exam_id", examId).eq("faculty_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("offline_results").select("*").eq("exam_id", examId).eq("faculty_id", user!.id).order("created_at", { ascending: false }),
    ]);
    setUploads((uploadsRes.data as UploadedFile[]) || []);
    setSavedResults((resultsRes.data as unknown as OfflineResult[]) || []);
    setLoading(false);
  };

  const handleUpload = async (fileType: string, files: FileList | null) => {
    if (!files || files.length === 0 || !selectedExam || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const filePath = `${user.id}/${selectedExam}/${fileType}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("exam-files").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: dbError } = await supabase.from("offline_uploads").insert({
          exam_id: selectedExam,
          faculty_id: user.id,
          file_type: fileType,
          file_path: filePath,
          original_name: file.name,
          student_label: "",
        } as any);
        if (dbError) throw dbError;
      }
      toast({ title: "Upload Successful", description: `${files.length} file(s) uploaded.` });
      fetchUploads(selectedExam);
    } catch (e: any) {
      toast({ title: "Upload Failed", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleDelete = async (upload: UploadedFile) => {
    await supabase.storage.from("exam-files").remove([upload.file_path]);
    await supabase.from("offline_uploads").delete().eq("id", upload.id);
    toast({ title: "Deleted" });
    fetchUploads(selectedExam);
  };

  const handleEvaluate = async () => {
    if (!selectedExam || !user) return;
    const answerSheets = uploads.filter((u) => u.file_type === "answer_sheet");
    if (answerSheets.length === 0) {
      toast({ title: "No Answer Sheets", description: "Upload student answer sheets first.", variant: "destructive" });
      return;
    }
    setEvaluating(true);
    setEvalResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-offline", {
        body: { exam_id: selectedExam, faculty_id: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEvalResults(data.results || []);
      toast({ title: "Evaluation Complete!", description: `${data.results?.length || 0} answer sheet(s) evaluated.` });
      // Refresh saved results
      fetchUploads(selectedExam);
    } catch (e: any) {
      toast({ title: "Evaluation Failed", description: e.message, variant: "destructive" });
    }
    setEvaluating(false);
  };

  const fileTypeLabel = (t: string) =>
    t === "question_paper" ? "Question Paper" : t === "answer_sheet" ? "Answer Sheet" : "Model Answer";

  const fileTypeColor = (t: string) =>
    t === "question_paper" ? "bg-primary/10 text-primary" : t === "answer_sheet" ? "bg-accent/10 text-accent-foreground" : "bg-muted text-muted-foreground";

  const hasAnswerSheets = uploads.some((u) => u.file_type === "answer_sheet");
  const displayResults = evalResults.length > 0 ? evalResults.map((r) => ({
    id: r.file_name,
    student_label: r.student_name,
    roll_number: r.roll_number,
    total_marks: r.total_marks,
    max_marks: r.max_marks,
    evaluation_data: r.questions,
  })) : savedResults;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Offline Evaluation</h1>
        <p className="text-sm text-muted-foreground">Upload question papers, answer sheets, and model answers for AI evaluation.</p>

        <Card>
          <CardContent className="p-6">
            <label className="mb-2 block text-sm font-medium text-foreground">Select Exam</label>
            <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); fetchUploads(v); setEvalResults([]); }}>
              <SelectTrigger><SelectValue placeholder="Choose an exam..." /></SelectTrigger>
              <SelectContent>
                {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedExam && (
          <div className="grid gap-4 md:grid-cols-3">
            {(["question_paper", "answer_sheet", "model_answer"] as const).map((type) => (
              <Card key={type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{fileTypeLabel(type)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    multiple={type === "answer_sheet"}
                    disabled={uploading}
                    onChange={(e) => handleUpload(type, e.target.files)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {type === "answer_sheet" ? "Upload multiple student answer sheets" : "Upload a single file"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {uploading && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading files...</span>
          </div>
        )}

        {/* Evaluate Button */}
        {selectedExam && hasAnswerSheets && (
          <div className="flex justify-center">
            <Button size="lg" onClick={handleEvaluate} disabled={evaluating} className="gap-2">
              {evaluating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Brain className="h-5 w-5" />}
              {evaluating ? "Evaluating Answer Sheets..." : "Evaluate Answer Sheets"}
            </Button>
          </div>
        )}

        {loading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

        {/* Uploaded Files List */}
        {!loading && selectedExam && uploads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Uploaded Files ({uploads.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg border bg-secondary/30 p-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.original_name}</p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${fileTypeColor(u.file_type)}`}>
                        {fileTypeLabel(u.file_type)}
                      </span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(u)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!loading && selectedExam && uploads.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No files uploaded for this exam yet.</CardContent></Card>
        )}

        {/* Evaluation Results */}
        {displayResults.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Evaluation Results</h2>
            {displayResults.map((result, idx) => {
              const key = result.id || `result-${idx}`;
              const isExpanded = expandedStudent === key;
              const evalData = (result.evaluation_data || []) as QuestionEval[];
              return (
                <Card key={key}>
                  <CardContent className="p-0">
                    <button
                      className="flex w-full items-center justify-between p-6 text-left"
                      onClick={() => setExpandedStudent(isExpanded ? null : key)}
                    >
                      <div>
                        <p className="text-base font-semibold text-foreground">{result.student_label || "Unknown Student"}</p>
                        <p className="text-sm text-muted-foreground">Roll No: {result.roll_number || "N/A"}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-primary/10 px-4 py-1 text-lg font-bold text-primary">
                          {result.total_marks}/{result.max_marks}
                        </span>
                        {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                      </div>
                    </button>
                    {isExpanded && evalData.length > 0 && (
                      <div className="border-t px-6 pb-6 pt-4 space-y-4">
                        {evalData.map((q, qi) => (
                          <div key={qi} className="rounded-lg border bg-secondary/20 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-foreground">Q{q.question_number}: {q.question_text}</p>
                              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                                {q.marks_obtained}/{q.max_marks}
                              </span>
                            </div>
                            {q.student_answer_summary && (
                              <p className="text-sm text-muted-foreground"><strong>Student Answer:</strong> {q.student_answer_summary}</p>
                            )}
                            <div className="rounded bg-muted/50 p-3">
                              <p className="text-sm font-medium text-foreground mb-1">Feedback:</p>
                              <p className="text-sm text-muted-foreground whitespace-pre-line">{q.feedback}</p>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3 text-right">
                          <span className="text-lg font-bold text-foreground">Total: {result.total_marks}/{result.max_marks}</span>
                        </div>
                      </div>
                    )}
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
