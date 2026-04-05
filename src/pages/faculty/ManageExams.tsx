import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, Eye, EyeOff, PlusCircle, Edit } from "lucide-react";

interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
  is_published: boolean;
  created_at: string;
}

export default function ManageExams() {
  const { user } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExams = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("faculty_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setExams(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchExams(); }, [user]);

  const togglePublish = async (exam: Exam) => {
    const { error } = await supabase
      .from("exams")
      .update({ is_published: !exam.is_published })
      .eq("id", exam.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: exam.is_published ? "Exam Unpublished" : "Exam Published", description: `"${exam.title}" is now ${exam.is_published ? "hidden from" : "visible to"} students.` });
      fetchExams();
    }
  };

  const deleteExam = async (exam: Exam) => {
    if (!confirm(`Delete "${exam.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("exams").delete().eq("id", exam.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Exam Deleted", description: `"${exam.title}" has been removed.` });
      fetchExams();
    }
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Exams</h1>
            <p className="text-sm text-muted-foreground">{exams.length} exam(s) created</p>
          </div>
          <Link to="/faculty/create-exam">
            <Button><PlusCircle className="mr-2 h-4 w-4" /> Create Exam</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="mb-4 text-muted-foreground">No exams created yet.</p>
              <Link to="/faculty/create-exam">
                <Button><PlusCircle className="mr-2 h-4 w-4" /> Create Your First Exam</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <Card key={exam.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-foreground">{exam.title}</h3>
                      <Badge variant={exam.is_published ? "default" : "secondary"}>
                        {exam.is_published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {exam.subject} • {exam.duration_minutes} min • {exam.total_marks} marks
                    </p>
                    {exam.description && <p className="mt-1 text-sm text-muted-foreground">{exam.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => togglePublish(exam)}>
                      {exam.is_published ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                      {exam.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => deleteExam(exam)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
