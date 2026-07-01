import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export async function POST(req: NextRequest) {
  try {
    const { message, context, apiKeys } = await req.json();

    if (!message || !context) {
      return NextResponse.json({ error: "Message and context are required." }, { status: 400 });
    }

    const { openaiApiKey, geminiApiKey } = apiKeys || {};
    
    // Choose model
    let model;
    if (openaiApiKey || process.env.OPENAI_API_KEY) {
      model = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.2,
        openAIApiKey: openaiApiKey || process.env.OPENAI_API_KEY,
      });
    } else if (geminiApiKey || process.env.GOOGLE_API_KEY) {
      model = new ChatGoogleGenerativeAI({
        modelName: "gemini-1.5-flash",
        temperature: 0.2,
        apiKey: geminiApiKey || process.env.GOOGLE_API_KEY,
      });
    } else {
      return NextResponse.json({ error: "No API keys configured." }, { status: 400 });
    }

    const systemPrompt = `You are EquiSense AI, an expert investment analyst. You have just generated the following investment report for a user.
Answer their follow-up question based on the data in the report. Be concise, professional, and directly address their query using the numbers and analysis provided.

REPORT CONTEXT:
${JSON.stringify(context, null, 2)}`;

    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    return NextResponse.json({ response: response.content });

  } catch (error: any) {
    console.error("Chat Error:", error);
    return NextResponse.json({ error: error.message || "Failed to get response" }, { status: 500 });
  }
}
