import { StateGraph, START, END } from "@langchain/langgraph";
import { ResearchStateAnnotation, ResearchState } from "./state";
import {
  gatherDataNode,
  financialAnalysisNode,
  marketAnalysisNode,
  swotNode,
  decisionNode,
} from "./nodes";

// Construct the StateGraph
const workflow = new StateGraph(ResearchStateAnnotation)
  .addNode("gatherData", gatherDataNode)
  .addNode("financialAnalysis", financialAnalysisNode)
  .addNode("assessMarket", marketAnalysisNode)
  .addNode("compileSwot", swotNode)
  .addNode("evaluateDecision", decisionNode);

// Define transitions
workflow.addEdge(START, "gatherData");

// We can add simple routing: if an error occurs during gatherData, skip to the decision/end
workflow.addConditionalEdges(
  "gatherData",
  (state: ResearchState) => {
    if (state.error) {
      return "evaluateDecision"; // Skip to end/decision node to gracefully wrap up
    }
    return "financialAnalysis";
  },
  {
    financialAnalysis: "financialAnalysis",
    evaluateDecision: "evaluateDecision",
  }
);

workflow.addEdge("financialAnalysis", "assessMarket");
workflow.addEdge("assessMarket", "compileSwot");
workflow.addEdge("compileSwot", "evaluateDecision");
workflow.addEdge("evaluateDecision", END);

// Compile the graph
export const app = workflow.compile();

/**
 * Runs the compiled research graph.
 * @param companyName Name of the company to analyze.
 * @param apiKeys Configuration of LLM and Tavily API keys.
 * @param onUpdate Event callback when a node yields a result (used for streaming updates).
 */
export async function runResearch(
  companyName: string,
  apiKeys: {
    openaiApiKey?: string;
    geminiApiKey?: string;
    anthropicApiKey?: string;
    tavilyApiKey?: string;
  },
  onUpdate?: (state: Partial<ResearchState>) => void
): Promise<ResearchState> {
  const initialState = {
    companyName,
    apiKeys,
    logs: [],
  };

  // We stream events from the graph
  const stream = await app.stream(initialState, {
    streamMode: "updates",
  });

  let currentState = { ...initialState } as any;

  for await (const update of stream) {
    // Each update is an object like { nodeName: { stateDelta } }
    const nodeName = Object.keys(update)[0];
    const delta = (update as any)[nodeName];
    
    // Merge logs
    const newLogs = delta.logs ? [...currentState.logs, ...delta.logs] : currentState.logs;
    
    currentState = {
      ...currentState,
      ...delta,
      logs: newLogs,
    };

    if (onUpdate) {
      onUpdate(currentState);
    }
  }

  return currentState;
}
