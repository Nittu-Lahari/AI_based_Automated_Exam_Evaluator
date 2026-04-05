
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('faculty', 'student');

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Create exams table
CREATE TABLE public.exams (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    faculty_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    total_marks INTEGER NOT NULL DEFAULT 100,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create questions table
CREATE TABLE public.questions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    model_answer TEXT NOT NULL DEFAULT '',
    marks INTEGER NOT NULL DEFAULT 10,
    question_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create student_answers table
CREATE TABLE public.student_answers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (student_id, question_id)
);

-- Create results table
CREATE TABLE public.results (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    marks_obtained NUMERIC(5,2) NOT NULL DEFAULT 0,
    feedback TEXT DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT false,
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (student_id, question_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own roles" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Exams policies
CREATE POLICY "Faculty can create exams" ON public.exams FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Faculty can update own exams" ON public.exams FOR UPDATE USING (auth.uid() = faculty_id AND public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Faculty can delete own exams" ON public.exams FOR DELETE USING (auth.uid() = faculty_id AND public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Faculty can view own exams" ON public.exams FOR SELECT USING (auth.uid() = faculty_id AND public.has_role(auth.uid(), 'faculty'));
CREATE POLICY "Students can view published exams" ON public.exams FOR SELECT USING (is_published = true AND public.has_role(auth.uid(), 'student'));

-- Questions policies
CREATE POLICY "Faculty can manage questions for own exams" ON public.questions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = questions.exam_id AND exams.faculty_id = auth.uid())
);
CREATE POLICY "Students can view questions of published exams" ON public.questions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = questions.exam_id AND exams.is_published = true)
);

-- Student answers policies
CREATE POLICY "Students can submit own answers" ON public.student_answers FOR INSERT WITH CHECK (auth.uid() = student_id AND public.has_role(auth.uid(), 'student'));
CREATE POLICY "Students can view own answers" ON public.student_answers FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Faculty can view answers for own exams" ON public.student_answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = student_answers.exam_id AND exams.faculty_id = auth.uid())
);

-- Results policies
CREATE POLICY "Faculty can manage results for own exams" ON public.results FOR ALL USING (
    EXISTS (SELECT 1 FROM public.exams WHERE exams.id = results.exam_id AND exams.faculty_id = auth.uid())
);
CREATE POLICY "Students can view own published results" ON public.results FOR SELECT USING (auth.uid() = student_id AND is_published = true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create role on signup based on metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
DECLARE
    _role TEXT;
BEGIN
    _role := NEW.raw_user_meta_data ->> 'role';
    IF _role = 'faculty' THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'faculty');
    ELSE
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
