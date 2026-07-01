import { Annotation } from "@langchain/langgraph";

export interface CompanyFinancials {
  symbol?: string;
  longName?: string;
  marketCap?: number;
  peRatio?: number | null;
  forwardPE?: number | null;
  eps?: number | null;
  revenueGrowth?: number | null; // e.g. 0.15 for 15%
  profitMargin?: number | null;  // e.g. 0.22 for 22%
  operatingMargin?: number | null;
  debtToEquity?: number | null;
  freeCashFlow?: number | null;
  dividendYield?: number | null;
  currentPrice?: number;
  currency?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
}

export interface NewsArticle {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  date?: string;
}

export interface SwotAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface Scorecard {
  growthScore: number;      // 0-20
  valuationScore: number;   // 0-20
  qualityScore: number;     // 0-20
  moatScore: number;        // 0-20
  riskScore: number;         // 0-20
  totalScore: number;        // 0-100 (sum of the above)
}

export interface AgentKeys {
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  tavilyApiKey?: string;
}

// LangGraph Annotation.Root defines the structure of our state
export const ResearchStateAnnotation = Annotation.Root({
  companyName: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  ticker: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  financials: Annotation<CompanyFinancials | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  news: Annotation<NewsArticle[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  marketAnalysis: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  swot: Annotation<SwotAnalysis | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  scorecard: Annotation<Scorecard | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  decision: Annotation<"INVEST" | "PASS" | "HOLD" | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  reasoning: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  logs: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  apiKeys: Annotation<AgentKeys>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  error: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

export type ResearchState = typeof ResearchStateAnnotation.State;
