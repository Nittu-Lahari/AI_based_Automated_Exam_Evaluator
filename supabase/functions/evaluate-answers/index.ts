import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnswerInput {
  student_id: string;
  question_id: string;
  answer_text: string;
  model_answer: string;
  max_marks: number;
  question_text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { answers } = await req.json() as { exam_id: string; answers: AnswerInput[] };

    if (!answers || answers.length === 0) {
      return new Response(JSON.stringify({ error: "No answers to evaluate" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const answer of answers) {
      const prompt = `You are a strict and fair exam evaluator. Evaluate the student's answer against the model answer.

Question: ${answer.question_text}

Model Answer: ${answer.model_answer}

Student Answer: ${answer.answer_text}

Maximum Marks: ${answer.max_marks}

Evaluate the student answer based on:
1. Relevance to the question
2. Similarity to model answer (key concepts, keywords)
3. Completeness and accuracy
4. Clarity of expression

Your feedback MUST include ALL of the following sections:
- **Marks Justification**: Why the student received these marks
- **Missing Keywords/Concepts**: List specific keywords or concepts from the model answer that are missing (e.g. "Missing keyword: ACID properties")
- **Weak Points**: Identify parts of the answer that are incomplete or poorly explained (e.g. "Explanation is incomplete for normalization")
- **Strengths**: What the student did well (if anything)

Be specific and actionable in your feedback. Do NOT give vague feedback like "good answer" or "needs improvement".

You MUST respond using the evaluate_answer tool.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a fair and accurate exam evaluator. Always use the provided tool to return structured results." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "evaluate_answer",
                description: "Return the evaluation result for a student answer",
                parameters: {
                  type: "object",
                  properties: {
                    marks_obtained: {
                      type: "number",
                      description: "Marks awarded to the student (0 to max_marks)",
                    },
                    feedback: {
                      type: "string",
                      description: "Detailed feedback explaining the evaluation",
                    },
                  },
                  required: ["marks_obtained", "feedback"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "evaluate_answer" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        throw new Error(`AI evaluation failed: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        // Clamp marks
        const marks = Math.min(Math.max(0, parsed.marks_obtained), answer.max_marks);
        results.push({
          student_id: answer.student_id,
          question_id: answer.question_id,
          marks_obtained: marks,
          feedback: parsed.feedback || "No feedback provided.",
        });
      } else {
        results.push({
          student_id: answer.student_id,
          question_id: answer.question_id,
          marks_obtained: 0,
          feedback: "AI evaluation could not process this answer.",
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Evaluate error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
