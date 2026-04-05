import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { exam_id, faculty_id } = await req.json();
    if (!exam_id || !faculty_id) {
      return new Response(JSON.stringify({ error: "exam_id and faculty_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch uploaded files for this exam
    const { data: uploads, error: uploadsErr } = await supabaseAdmin
      .from("offline_uploads")
      .select("*")
      .eq("exam_id", exam_id)
      .eq("faculty_id", faculty_id);

    if (uploadsErr) throw uploadsErr;
    if (!uploads || uploads.length === 0) {
      return new Response(JSON.stringify({ error: "No uploaded files found for this exam" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modelAnswerFiles = uploads.filter((u: any) => u.file_type === "model_answer");
    const answerSheetFiles = uploads.filter((u: any) => u.file_type === "answer_sheet");
    const questionPaperFiles = uploads.filter((u: any) => u.file_type === "question_paper");

    if (answerSheetFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No student answer sheets uploaded" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file and return as base64 data URL or signed URL depending on type
    const getFileContent = async (filePath: string, originalName: string) => {
      const ext = originalName.split(".").pop()?.toLowerCase() || "";
      const isPdf = ext === "pdf";

      if (isPdf) {
        // Download the file bytes and convert to base64 data URL
        const { data, error } = await supabaseAdmin.storage
          .from("exam-files")
          .download(filePath);
        if (error) throw error;
        const arrayBuffer = await data.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const b64 = base64Encode(bytes);
        return { type: "pdf", dataUrl: `data:application/pdf;base64,${b64}` };
      } else {
        // For images, signed URL works fine
        const { data, error } = await supabaseAdmin.storage
          .from("exam-files")
          .createSignedUrl(filePath, 3600);
        if (error) throw error;
        return { type: "image", url: data.signedUrl };
      }
    };

    // Build image_url content part for AI - handles both PDF data URLs and image URLs
    const buildImagePart = (fileContent: { type: string; dataUrl?: string; url?: string }) => {
      if (fileContent.type === "pdf") {
        return { type: "image_url" as const, image_url: { url: fileContent.dataUrl! } };
      }
      return { type: "image_url" as const, image_url: { url: fileContent.url! } };
    };

    // Get model answer text via AI vision
    let modelAnswerText = "No model answer provided.";
    if (modelAnswerFiles.length > 0) {
      const modelContent = await getFileContent(modelAnswerFiles[0].file_path, modelAnswerFiles[0].original_name);
      modelAnswerText = await extractTextFromFile(LOVABLE_API_KEY, modelContent, "Extract ALL text from this model answer sheet. Preserve the structure with question numbers and answers.");
    }

    // Get question paper text
    let questionPaperText = "";
    if (questionPaperFiles.length > 0) {
      const qpContent = await getFileContent(questionPaperFiles[0].file_path, questionPaperFiles[0].original_name);
      questionPaperText = await extractTextFromFile(LOVABLE_API_KEY, qpContent, "Extract ALL text from this question paper. List each question with its number and marks if visible.");
    }

    // Get exam info
    const { data: examData } = await supabaseAdmin.from("exams").select("title, total_marks").eq("id", exam_id).single();
    const examTitle = examData?.title || "Exam";
    const examTotalMarks = examData?.total_marks || 100;

    // Process each student answer sheet
    const allResults = [];

    for (let i = 0; i < answerSheetFiles.length; i++) {
      const sheet = answerSheetFiles[i];
      const sheetContent = await getFileContent(sheet.file_path, sheet.original_name);

      // Step 1: OCR - Extract text from student answer sheet
      const studentText = await extractTextFromFile(
        LOVABLE_API_KEY,
        sheetContent,
        "Extract ALL text from this student answer sheet. Look for student name, roll number at the top. Then extract each answer with its question number. Preserve structure."
      );

      // Step 2: AI Evaluation
      const evalPrompt = `You are an intelligent, fair exam evaluator who grades based on MEANING and CONCEPTUAL UNDERSTANDING — NOT exact keyword matching.

QUESTION PAPER:
${questionPaperText || "Not provided - infer questions from the model answer."}

MODEL ANSWER:
${modelAnswerText}

STUDENT ANSWER SHEET (OCR extracted):
${studentText}

TOTAL MARKS FOR EXAM: ${examTotalMarks}

CRITICAL INSTRUCTIONS:

1. You MUST evaluate ALL questions from the question paper/model answer. Do NOT skip any question.

2. For EVERY question, provide feedback — even for full marks:
   - Full marks → "Good answer. Well explained." or describe what was done well.
   - Partial marks → Explain which concepts are present and which are missing.
   - Zero/low marks → Explain what is missing and what was expected.

3. EXTRACT KEY CONCEPTS from the model answer.
   Example: If model says "ACID properties: Atomicity, Consistency, Isolation, Durability"
   → Key concepts = [Atomicity, Consistency, Isolation, Durability] with their meanings.

4. SEMANTIC MATCHING — For each concept, check if the student's answer conveys the SAME MEANING using different words.
   ✅ Accept: "all or nothing" = Atomicity, "data stays correct" = Consistency
   ❌ Do NOT require the exact term if the meaning is clearly expressed.

5. SIMILARITY SCORING:
   - Full marks: Student covers all key concepts with correct meaning.
   - Partial marks: Some concepts present, others missing or vaguely stated.
   - Low marks: Most concepts missing or answer is irrelevant.

6. For student_answer_summary: Include a brief summary of what the student actually wrote for each question. This is MANDATORY for every question.

7. First identify student name and roll number from the top of the answer sheet. If not found, use "Student ${i + 1}" and "N/A".

You MUST respond using the evaluate_student tool with ALL questions included.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a fair exam evaluator. Always use the provided tool. You MUST include ALL questions in your response — never skip any. Provide feedback for every question including full-marks answers." },
            { role: "user", content: evalPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "evaluate_student",
              description: "Return structured evaluation for a student's answer sheet. MUST include ALL questions.",
              parameters: {
                type: "object",
                properties: {
                  student_name: { type: "string", description: "Student name extracted from the sheet" },
                  roll_number: { type: "string", description: "Roll number extracted from the sheet" },
                  questions: {
                    type: "array",
                    description: "Array of ALL questions evaluated. Must include every question from the paper.",
                    items: {
                      type: "object",
                      properties: {
                        question_number: { type: "number" },
                        question_text: { type: "string", description: "The full question text" },
                        student_answer_summary: { type: "string", description: "Summary of what the student wrote. MANDATORY." },
                        marks_obtained: { type: "number" },
                        max_marks: { type: "number" },
                        feedback: { type: "string", description: "Detailed feedback. For full marks: praise what was done well. For partial: explain missing concepts. For zero: explain what was expected." },
                      },
                      required: ["question_number", "question_text", "student_answer_summary", "marks_obtained", "max_marks", "feedback"],
                      additionalProperties: false,
                    },
                  },
                  total_marks: { type: "number" },
                  max_total_marks: { type: "number" },
                },
                required: ["student_name", "roll_number", "questions", "total_marks", "max_total_marks"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "evaluate_student" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        throw new Error(`AI evaluation failed: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        
        // Store in offline_results
        await supabaseAdmin.from("offline_results").insert({
          exam_id,
          faculty_id,
          student_label: parsed.student_name || `Student ${i + 1}`,
          roll_number: parsed.roll_number || "N/A",
          total_marks: parsed.total_marks || 0,
          max_marks: parsed.max_total_marks || examTotalMarks,
          evaluation_data: parsed.questions || [],
        });

        allResults.push({
          student_name: parsed.student_name,
          roll_number: parsed.roll_number,
          total_marks: parsed.total_marks,
          max_marks: parsed.max_total_marks,
          questions: parsed.questions,
          file_name: sheet.original_name,
        });
      } else {
        allResults.push({
          student_name: `Student ${i + 1}`,
          roll_number: "N/A",
          total_marks: 0,
          max_marks: examTotalMarks,
          questions: [],
          file_name: sheet.original_name,
          error: "AI could not process this answer sheet",
        });
      }

      // Small delay between sheets to avoid rate limiting
      if (i < answerSheetFiles.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return new Response(JSON.stringify({ results: allResults, exam_title: examTitle }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Offline evaluate error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function extractTextFromFile(
  apiKey: string,
  fileContent: { type: string; dataUrl?: string; url?: string },
  instruction: string
): Promise<string> {
  const imageUrl = fileContent.type === "pdf" ? fileContent.dataUrl! : fileContent.url!;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("OCR error:", response.status, errText);
    return "Could not extract text from file.";
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No text extracted.";
}
