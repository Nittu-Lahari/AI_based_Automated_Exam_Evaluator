
-- Add roll_number to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roll_number text DEFAULT '';

-- Create offline_results table for storing offline evaluation results
CREATE TABLE IF NOT EXISTS public.offline_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    faculty_id uuid NOT NULL,
    student_label text NOT NULL DEFAULT '',
    roll_number text NOT NULL DEFAULT '',
    total_marks numeric NOT NULL DEFAULT 0,
    max_marks numeric NOT NULL DEFAULT 0,
    evaluation_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.offline_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Faculty can manage own offline results"
ON public.offline_results FOR ALL
USING (auth.uid() = faculty_id AND has_role(auth.uid(), 'faculty'::app_role));

CREATE POLICY "Anyone authenticated can view offline results"
ON public.offline_results FOR SELECT
TO authenticated
USING (true);
