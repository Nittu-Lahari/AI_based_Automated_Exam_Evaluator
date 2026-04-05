
-- Allow faculty to read student profiles (needed for showing student names in results)
CREATE POLICY "Faculty can view student profiles"
  ON public.profiles FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'faculty'::app_role));

-- Create storage bucket for offline answer uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-files', 'exam-files', false);

-- Storage RLS: faculty can upload files
CREATE POLICY "Faculty can upload exam files"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'exam-files' AND has_role(auth.uid(), 'faculty'::app_role));

-- Storage RLS: faculty can read own files
CREATE POLICY "Faculty can read exam files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'exam-files' AND has_role(auth.uid(), 'faculty'::app_role));

-- Storage RLS: faculty can delete own files
CREATE POLICY "Faculty can delete exam files"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'exam-files' AND has_role(auth.uid(), 'faculty'::app_role));

-- Table for offline uploaded answer sheets linked to exams
CREATE TABLE public.offline_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('question_paper', 'answer_sheet', 'model_answer')),
  file_path text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  student_label text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offline_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Faculty can manage own uploads"
  ON public.offline_uploads FOR ALL
  TO public
  USING (auth.uid() = faculty_id AND has_role(auth.uid(), 'faculty'::app_role));
