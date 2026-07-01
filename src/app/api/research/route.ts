import { NextRequest } from "next/server";
import { runResearch } from "../../../lib/agent/graph";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { companyName, apiKeys } = await req.json();

    if (!companyName) {
      return new Response(JSON.stringify({ error: "Company name is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await runResearch(companyName, apiKeys || {}, (stateUpdate) => {
            // Prepare a safe update object (strip out the raw apiKeys)
            const safeUpdate = { ...stateUpdate };
            delete safeUpdate.apiKeys;
            
            // Format as Server-Sent Event (SSE)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(safeUpdate)}\n\n`)
            );
          });
          controller.close();
        } catch (err: any) {
          console.error("Error running research stream:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("Error in API route POST handler:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
