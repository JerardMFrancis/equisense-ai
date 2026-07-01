import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ResearchState, SwotAnalysis, Scorecard, AgentKeys } from "./state";
import { searchTicker, fetchFinancials, searchWeb } from "./tools";

// Helper to initialize the correct LLM based on user configuration
// Returns null if no API keys are provided (triggering Demo Mode)
function getLLM(apiKeys: AgentKeys) {
  const openAiKey = apiKeys.openaiApiKey || process.env.OPENAI_API_KEY;
  const geminiKey = apiKeys.geminiApiKey || process.env.GEMINI_API_KEY;

  if (openAiKey) {
    return new ChatOpenAI({
      openAIApiKey: openAiKey,
      modelName: "gpt-4o-mini",
      temperature: 0.1,
    });
  } else if (geminiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: geminiKey,
      model: "gemini-1.5-flash",
      temperature: 0.1,
    });
  } else {
    // Return null to signify Demo/Simulated Mode
    return null;
  }
}

/**
 * Extracts and parses a JSON block from LLM output.
 */
function parseJSONBlock<T>(text: string): T {
  const mdRegex = /```json\s*([\s\S]*?)\s*```/;
  const mdMatch = text.match(mdRegex);
  let rawText = mdMatch ? mdMatch[1] : text;

  const jsonRegex = /\{[\s\S]*\}/;
  const match = rawText.match(jsonRegex);
  if (match) {
    try {
      return JSON.parse(match[0]) as T;
    } catch (e) {
      console.error("Failed to parse JSON substring:", match[0], e);
    }
  }
  throw new Error("Could not parse valid JSON from LLM output. Raw text was: " + text);
}

/**
 * 1. GATHER DATA NODE
 * Resolves ticker symbol, pulls financial statements, and queries web search.
 */
export async function gatherDataNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const logs = [`🔍 Initializing research for "${state.companyName}"...`];
  
  try {
    // 1. Resolve ticker symbol
    logs.push("📊 Resolving stock ticker symbol...");
    const tickerResult = await searchTicker(state.companyName);
    
    if (!tickerResult) {
      logs.push(`⚠️ Could not resolve a ticker for "${state.companyName}". Using name directly.`);
      return {
        ticker: state.companyName.toUpperCase(),
        logs: logs.concat(["❌ Data gathering halted: Ticker resolution failed."]),
        error: "Ticker symbol could not be found. Please check the company name.",
      };
    }
    
    const ticker = tickerResult.symbol;
    const resolvedName = tickerResult.name;
    logs.push(`✅ Resolved ticker: ${ticker} (${resolvedName})`);
    
    // 2. Fetch financials
    logs.push(`📈 Fetching financial details and key statistics for ${ticker}...`);
    const financials = await fetchFinancials(ticker);
    
    if (!financials) {
      logs.push(`⚠️ No stock metrics found for ${ticker}. Continuing with web search only.`);
    } else {
      logs.push(`✅ Retrieved financial data (Market Cap: ${financials.marketCap ? (financials.marketCap / 1e9).toFixed(2) + "B" : "N/A"}, Sector: ${financials.sector || "N/A"})`);
    }

    // 3. Web Search News
    const searchQuery = `${resolvedName} ${ticker} stock analysis investment research news 2026`;
    logs.push(`🌐 Conducting web research on recent developments for ${resolvedName}...`);
    const news = await searchWeb(searchQuery, state.apiKeys?.tavilyApiKey);
    logs.push(`✅ Found ${news.length} relevant articles/news records.`);

    return {
      ticker,
      financials,
      news,
      logs: logs.concat(["✅ Data gathering completed successfully."]),
    };
  } catch (error: any) {
    console.error("Error in gatherDataNode:", error);
    return {
      logs: logs.concat([`❌ Error gathering data: ${error.message || error}`]),
      error: `GatherDataNode error: ${error.message || error}`,
    };
  }
}

/**
 * 2. FINANCIAL ANALYSIS NODE
 * Digests the financial ratios and comments on financial stability.
 */
export async function financialAnalysisNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const logs = ["🔬 Analyzing financial stability and performance..."];
  
  if (state.error) return {};

  try {
    const llm = getLLM(state.apiKeys);
    
    if (!llm) {
      // DEMO MODE fallback
      logs.push("⚠️ No LLM API key detected. Initiating Simulation Engine...");
      logs.push("🔬 [Simulation] Analyzing balance sheet and profitability margins...");
      
      const fin = state.financials;
      const peInfo = fin?.peRatio ? `trailing P/E ratio is ${fin.peRatio.toFixed(1)}` : "P/E ratio is currently unavailable";
      const growthInfo = fin?.revenueGrowth !== null && fin?.revenueGrowth !== undefined
        ? `revenue growth rate is ${(fin.revenueGrowth * 100).toFixed(1)}%`
        : "revenue growth is flat or undisclosed";
      const marginInfo = fin?.operatingMargin !== null && fin?.operatingMargin !== undefined
        ? `operating margin stands at ${(fin.operatingMargin * 100).toFixed(1)}%`
        : "operating margins are under pressure";
      const debtInfo = fin?.debtToEquity !== null && fin?.debtToEquity !== undefined
        ? `debt-to-equity leverage is ${fin.debtToEquity.toFixed(1)}%`
        : "debt profile is conservative";

      const demoReport = `### Financial Health & Valuation Analysis

[SIMULATED ANALYST COMMENTARY]
An inspection of the financial architecture for ${state.companyName} (${state.ticker || "N/A"}) reveals key operational highlights. The company's ${growthInfo}, backed by an operating margin of ${marginInfo}. This indicates a ${fin && (fin.operatingMargin ?? 0) > 0.15 ? "highly efficient operating model with strong pricing power" : "mature business model with stabilizing margin structures"}.

Valuation-wise, the company's ${peInfo}. Compared to the industry peers, this represents a ${fin && (fin.peRatio ?? 20) > 30 ? "growth-premium multiple, implying high forward expectations" : "moderate multiple, reflecting solid value alignment"}. Furthermore, the balance sheet safety is underscored by a ${debtInfo}. Capital allocation is supported by a free cash flow generation of ${fin?.freeCashFlow ? (fin.freeCashFlow / 1e9).toFixed(2) + "B" : "healthy levels"}, which secures operational liquidity.`;

      return {
        logs: logs.concat(["✅ Financial performance analysis completed."]),
        marketAnalysis: demoReport,
      };
    }
    
    const financialsStr = state.financials 
      ? JSON.stringify(state.financials, null, 2) 
      : "No financial statements available. Rely on news and general search findings.";
      
    const newsStr = state.news.map(n => `- ${n.title} (${n.source}): ${n.snippet}`).join("\n");

    const prompt = `You are a Senior Financial Analyst. Review the financial metrics and recent news for ${state.companyName} (${state.ticker}).
    
    Financial Metrics:
    ${financialsStr}
    
    Recent News/Articles:
    ${newsStr}
    
    Analyze:
    1. Revenue growth trends & profit margins (gross, operating).
    2. Debt leverage (debt-to-equity ratio) and liquidity.
    3. Valuation parameters (P/E ratio, forward P/E, EPS) compared to industry standards.
    4. Capital allocation efficiency (Free Cash Flow, dividends).
    
    Provide a detailed financial analysis report (2-3 paragraphs). Focus on numbers and financial ratios.`;

    const response = await llm.invoke(prompt);
    const content = response.content as string;

    return {
      logs: logs.concat(["✅ Financial performance analysis completed."]),
      marketAnalysis: `### Financial Health & Valuation Analysis\n\n${content}`,
    };
  } catch (error: any) {
    console.error("Error in financialAnalysisNode:", error);
    return {
      logs: logs.concat([`❌ Financial analysis failed: ${error.message || error}`]),
      error: `FinancialAnalysisNode error: ${error.message || error}`,
    };
  }
}

/**
 * 3. MARKET AND COMPETITIVE ANALYSIS NODE
 * Evaluates the business moat, market dynamics, and industry trend.
 */
export async function marketAnalysisNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const logs = ["🌍 Evaluating business model, market opportunities, and competitive moat..."];
  
  if (state.error) return {};

  try {
    const llm = getLLM(state.apiKeys);
    
    if (!llm) {
      // DEMO MODE fallback
      logs.push("🌍 [Simulation] Mapping competitor share, switching costs, and industry headwinds...");
      const fin = state.financials;
      
      const demoReport = `### Market Position & Competitive Moat

[SIMULATED STRATEGY REPORT]
${state.companyName} operates in a highly dynamic sector, positioning itself as a ${fin?.sector === "Technology" ? "core digital pioneer leveraging technological lock-in" : "critical industrial participant with entrenched business relationships"}. The competitive moat is primarily anchored around ${fin && (fin.marketCap ?? 0) > 100e9 ? "massive capital scale, global brand awareness, and network dependencies" : "high switching costs and specialized niche product execution"}. 

Looking forward, major structural headwinds include technological disruption and regulatory compliance costs. However, opportunities in geographic expansion and operational digitisation represent robust tailwinds. The primary competitor landscape is crowded, but ${state.ticker || "this ticker"} retains dominant pricing authority within its core market demographics, safeguarding its long-term market share.`;

      const updatedMarketAnalysis = state.marketAnalysis 
        ? `${state.marketAnalysis}\n\n${demoReport}`
        : demoReport;

      return {
        logs: logs.concat(["✅ Market and competitive position analysis completed."]),
        marketAnalysis: updatedMarketAnalysis,
      };
    }
    
    const businessSummary = state.financials?.longBusinessSummary || "No business summary available.";
    const newsStr = state.news.map(n => `- ${n.title} (${n.source}): ${n.snippet}`).join("\n");

    const prompt = `You are an Equity Research Analyst specializing in industry strategy. Evaluate the competitive positioning and market opportunities of ${state.companyName} (${state.ticker}).
    
    Business Summary:
    ${businessSummary}
    
    Recent news & events:
    ${newsStr}
    
    Analyze:
    1. The company's core business model and revenue drivers.
    2. Competitive Moat: Does it possess high switching costs, brand value, network effects, or cost advantages?
    3. Industry Trends: Growth potential of the market segment, regulatory headwinds, or technological disruptions.
    4. Main Competitors and market share dynamics.
    
    Provide a detailed qualitative analysis report (2-3 paragraphs). Focus on structural competitive advantages and strategic headwinds.`;

    const response = await llm.invoke(prompt);
    const content = response.content as string;

    const updatedMarketAnalysis = state.marketAnalysis 
      ? `${state.marketAnalysis}\n\n### Market Position & Competitive Moat\n\n${content}`
      : `### Market Position & Competitive Moat\n\n${content}`;

    return {
      logs: logs.concat(["✅ Market and competitive position analysis completed."]),
      marketAnalysis: updatedMarketAnalysis,
    };
  } catch (error: any) {
    console.error("Error in marketAnalysisNode:", error);
    return {
      logs: logs.concat([`❌ Market analysis failed: ${error.message || error}`]),
      error: `MarketAnalysisNode error: ${error.message || error}`,
    };
  }
}

/**
 * 4. SWOT ANALYSIS NODE
 * Formulates a structured 2x2 SWOT grid.
 */
export async function swotNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const logs = ["📋 Formulating structured SWOT quadrants..."];
  
  if (state.error) return {};

  try {
    const llm = getLLM(state.apiKeys);
    
    if (!llm) {
      // DEMO MODE fallback
      logs.push("📋 [Simulation] Extracting SWOT metrics based on ticker data...");
      
      const company = state.companyName.toLowerCase();
      let swot: SwotAnalysis;

      if (company.includes("nvidia") || state.ticker === "NVDA") {
        swot = {
          strengths: [
            "Dominant market share (80%+) in AI hardware acceleration.",
            "Exceptional net profit margins (>40%) reflecting pricing power.",
            "Deep ecosystem lock-in via CUDA software developer platform."
          ],
          weaknesses: [
            "High customer concentration among top cloud providers.",
            "Vulnerability to export controls and geopolitical chips restrictions.",
            "Premium valuation leaves little room for execution missteps."
          ],
          opportunities: [
            "Expansion into enterprise AI software and cloud services.",
            "Increasing autonomous vehicle and robotics chips pipelines.",
            "Sovereign nation AI compute buildouts globally."
          ],
          threats: [
            "Rising competition from hyperscaler in-house custom silicon (TPUs, ASICs).",
            "Geopolitical tensions affecting supply security from TSMC.",
            "Cyclical hardware procurement slowdowns."
          ]
        };
      } else if (company.includes("apple") || state.ticker === "AAPL") {
        swot = {
          strengths: [
            "Immense brand loyalty and high ecosystem switching costs.",
            "Massive recurring cash flow ($100B+ FCF annually).",
            "Premium consumer hardware pricing power."
          ],
          weaknesses: [
            "High revenue dependency on iPhone product cycles.",
            "Perceived slow start in on-device generative AI features.",
            "Antitrust regulatory actions in US and EU."
          ],
          opportunities: [
            "Apple Intelligence rollouts driving consumer upgrade cycle.",
            "High-margin Services segment growth (Music, Pay, iCloud).",
            "Wearables expansion including spatial computing."
          ],
          threats: [
            "Assembly and manufacturing concentration in China.",
            "Lengthening consumer smartphone upgrade cycles.",
            "Android competition in developing market segments."
          ]
        };
      } else if (company.includes("gamestop") || state.ticker === "GME") {
        swot = {
          strengths: [
            "Substantial cash reserves ($4B+) from equity distributions.",
            "Zero long-term debt securing balance sheet safety.",
            "Devoted retail shareholder base supporting stock demand."
          ],
          weaknesses: [
            "Declining brick-and-mortar retail video game sales.",
            "Consistently negative operational core profit margin.",
            "Lack of clear, scalable new business model."
          ],
          opportunities: [
            "Strategic mergers & acquisitions using $4B cash reserves.",
            "Pivoting towards retro gaming and collectible merchandise.",
            "Transition into a capital holding company."
          ],
          threats: [
            "Accelerating transition to digital-only game distribution by Sony/Microsoft.",
            "High stock price volatility detached from underlying fundamentals.",
            "Cash drag if funds are not deployed into yield-bearing assets."
          ]
        };
      } else if (company.includes("reliance") || state.ticker === "RELIANCE.NS") {
        swot = {
          strengths: [
            "Market leadership in Indian Retail, Telecom (Jio), and Refining.",
            "Massive telecom consumer ecosystem (>450M Jio subscribers).",
            "Enormous capital backing and regulatory alignment."
          ],
          weaknesses: [
            "Highly capital-intensive expansion cycles dragging net returns.",
            "Oil-to-chemicals segment remains cyclical and carbon-exposed.",
            "Complex corporate structure spans highly divergent businesses."
          ],
          opportunities: [
            "Green energy pivot via gigafactories in Gujarat.",
            "Spin-offs and public listings of Retail and Jio divisions.",
            "Dominating Indian e-commerce and digital streaming (JioCinema)."
          ],
          threats: [
            "Crude oil volatility affecting petrochem margins.",
            "Tariff price controls or regulatory shifts in telecom.",
            "Aggressive competition from global retail giants in India."
          ]
        };
      } else {
        // Generic rules-based fallback for any other company
        const fin = state.financials;
        const hasGrowth = (fin?.revenueGrowth ?? 0) > 0.1;
        const hasMargins = (fin?.operatingMargin ?? 0) > 0.15;
        const hasHighDebt = (fin?.debtToEquity ?? 0) > 100;
        
        swot = {
          strengths: [
            `Established position in ${fin?.sector || "its industry"} sector.`,
            hasMargins ? "Strong operating margins indicating good cost management." : "Reasonable operational scale and asset base.",
            "Consistent product delivery keeping baseline market share."
          ],
          weaknesses: [
            hasHighDebt ? "Elevated debt-to-equity leverage posing balance sheet risk." : "Slowing market penetration in mature geographies.",
            "Exposed to material and logistics cost fluctuations.",
            "Vulnerability to sector-wide margin consolidation."
          ],
          opportunities: [
            "Leveraging digital automation to optimize operating expenses.",
            hasGrowth ? "Expanding footprint in high-growth regional markets." : "Product line extensions into adjacent consumer segments.",
            "Potential strategic partnerships or consolidation."
          ],
          threats: [
            "Macroeconomic interest rate fluctuations impacting cost of capital.",
            "Evolving regulatory compliance and carbon tax requirements.",
            "Aggressive pricing actions by lower-cost regional competitors."
          ]
        };
      }

      return {
        swot,
        logs: logs.concat(["✅ SWOT analysis compiled."]),
      };
    }
    
    const context = `
    Company: ${state.companyName} (${state.ticker})
    Sector: ${state.financials?.sector || "N/A"} / ${state.financials?.industry || "N/A"}
    Business Profile: ${state.financials?.longBusinessSummary || "N/A"}
    Prior Analysis:
    ${state.marketAnalysis}
    `;

    const prompt = `You are an investment strategist. Based on the financial and competitive analysis of ${state.companyName}, formulate a SWOT Analysis (Strengths, Weaknesses, Opportunities, Threats).
    
    Context:
    ${context}
    
    You must output ONLY a valid JSON object matching this structure:
    {
      "strengths": ["bullet point 1", "bullet point 2", "bullet point 3"],
      "weaknesses": ["bullet point 1", "bullet point 2", "bullet point 3"],
      "opportunities": ["bullet point 1", "bullet point 2", "bullet point 3"],
      "threats": ["bullet point 1", "bullet point 2", "bullet point 3"]
    }
    
    Ensure you provide 3-4 highly specific bullet points for each quadrant. Do not output anything else than JSON.`;

    const response = await llm.invoke(prompt);
    const content = response.content as string;
    
    const swot = parseJSONBlock<SwotAnalysis>(content);

    return {
      swot,
      logs: logs.concat(["✅ SWOT analysis compiled."]),
    };
  } catch (error: any) {
    console.error("Error in swotNode:", error);
    return {
      logs: logs.concat([`❌ SWOT analysis failed: ${error.message || error}`]),
      error: `SwotNode error: ${error.message || error}`,
    };
  }
}

/**
 * 5. INVESTMENT COMMITTEE DECISION NODE
 * Computes scores, renders the verdict (INVEST/PASS) and drafts the final investment thesis.
 */
export async function decisionNode(state: ResearchState): Promise<Partial<ResearchState>> {
  const logs = ["⚖️ Investment Committee evaluating verdict..."];
  
  if (state.error) return {};

  try {
    const llm = getLLM(state.apiKeys);

    if (!llm) {
      // DEMO MODE fallback
      logs.push("⚖️ [Simulation] Deliberating final committee rating and risk parameters...");
      
      const company = state.companyName.toLowerCase();
      const fin = state.financials;
      
      let scorecard: Scorecard;
      let decision: "INVEST" | "PASS";
      let reasoning: string;

      // Mathematical rating based on actual financials to keep it data-driven
      const growthScore = Math.min(20, Math.max(4, Math.floor(10 + ((fin?.revenueGrowth ?? 0.05) * 40))));
      const qualityScore = Math.min(20, Math.max(4, Math.floor(12 + ((fin?.operatingMargin ?? 0.08) * 30))));
      const valuationScore = fin?.peRatio 
        ? Math.min(20, Math.max(4, Math.floor(20 - (fin.peRatio / 4))))
        : 12;
      const moatScore = fin && (fin.marketCap ?? 0) > 80e9 ? 17 : (fin?.operatingMargin ?? 0) > 0.15 ? 15 : 11;
      const riskScore = fin?.debtToEquity 
        ? Math.min(20, Math.max(4, Math.floor(18 - (fin.debtToEquity / 25))))
        : 13;

      const totalScore = growthScore + qualityScore + valuationScore + moatScore + riskScore;
      decision = totalScore >= 60 ? "INVEST" : "PASS";

      // Tailored markdown thesis reports
      if (company.includes("nvidia") || state.ticker === "NVDA") {
        decision = "INVEST";
        scorecard = { growthScore: 19, valuationScore: 9, qualityScore: 19, moatScore: 18, riskScore: 15, totalScore: 80 };
        scorecard.totalScore = 80;
        reasoning = `### Executive Summary

We recommend an **INVEST** decision for Nvidia (NVDA) with a high conviction consensus rating of **80/100**. Nvidia represents the core infrastructure layer of the artificial intelligence boom, operating with massive pricing power and an entrenched software barrier.

### Core Thesis (Why we Invest)

1. **Unrivaled Computing Dominance:** Nvidia holds over 85% of the AI data center chip market. Its architecture has become the gold standard for model training and inference.
2. **CUDA Ecosystem Moat:** The CUDA software framework has millions of active developers. It creates huge switching costs, as applications written on CUDA cannot easily run on competitor hardware.
3. **Explosive Profitability:** Operating margins over 50% are historically unprecedented for a hardware scale company, demonstrating immense pricing authority.

### Key Risks & Monitorables

1. **Hyperscaler Custom Silicon:** Customers like Google, Microsoft, and Amazon are actively designing custom ASICs (TPUs, Inferentia) to reduce dependencies.
2. **Taiwan Geopolitical Exposure:** Entire fabrication depends on TSMC in Taiwan; any disruption represents a catastrophic risk.
3. **Advanced Packaging Supply:** Monitor CoWoS packaging yield speeds at TSMC as they dictate near-term revenue limits.`;
      } else if (company.includes("apple") || state.ticker === "AAPL") {
        decision = "INVEST";
        scorecard = { growthScore: 13, valuationScore: 11, qualityScore: 18, moatScore: 18, riskScore: 16, totalScore: 76 };
        scorecard.totalScore = 76;
        reasoning = `### Executive Summary

We recommend an **INVEST** decision for Apple (AAPL) with a consensus score of **76/100**. Apple offers a fortress balance sheet, unmatched consumer ecosystem locking, and high-margin services that buffer hardware cycles.

### Core Thesis (Why we Invest)

1. **Ecosystem & High Switching Costs:** Apple's active installed device base exceeds 2.2 billion units. The seamless integration of hardware, software, and services ensures near-perfect customer retention.
2. **Services Engine:** The services division generates high-margin recurring revenues (iCloud, App Store, Apple Pay), which expands gross profit independently of device sales.
3. **AI Upgrade Cycle:** Apple Intelligence represents a compelling hardware catalyst, forcing upgrades across older iPhone cohorts.

### Key Risks & Monitorables

1. **Antitrust Actions:** US Department of Justice and EU regulatory actions targeting App Store fees and ecosystem dominance could disrupt margin structures.
2. **Slowing Innovation:** A failure to introduce hardware form-factor breakthroughs could lengthen consumer upgrade schedules.
3. **Assembly Concentration:** Monitor supply chain diversification efforts in India and Vietnam away from China.`;
      } else if (company.includes("gamestop") || state.ticker === "GME") {
        decision = "PASS";
        scorecard = { growthScore: 4, valuationScore: 6, qualityScore: 7, moatScore: 4, riskScore: 11, totalScore: 32 };
        scorecard.totalScore = 32;
        reasoning = `### Executive Summary

We recommend a **PASS** decision for GameStop (GME) with a score of **32/100**. While the company sits on substantial interest-bearing cash reserves, the core retail gaming operation is in terminal structural decline.

### Core Thesis (Why we Pass)

1. **Physical Retail Obsolescence:** Modern game consoles (PS5 Digital, Xbox Series S) bypass physical discs. As game distribution pivots completely to digital downloads and subscription services, GameStop's primary revenue driver is disappearing.
2. **Operating Inefficiencies:** The brick-and-mortar stores are unprofitable on an operating basis, showing negative organic cash flows when excluding stock issuance dilutive proceeds.
3. **No Clear Turnaround Plan:** The board has not presented a viable capital deployment strategy for their $4B cash balance, leaving GME as an inefficient, volatile investment trust.

### Key Risks & Monitorables

1. **M&A Catalyst:** Monitor if management deploys the cash reserves to acquire a highly profitable digital or fintech enterprise.
2. **Retail Volatility:** Extreme speculative surges could temporarily spike share price, though detached from operational metrics.`;
      } else {
        // Dynamic generic report using the computed scorecard
        scorecard = { growthScore, valuationScore, qualityScore, moatScore, riskScore, totalScore };
        decision = totalScore >= 70 ? "INVEST" : totalScore >= 40 ? "HOLD" : "PASS";

        reasoning = `
### Financial Health

1. **Operational Metrics Alignment:** The company displays an operating margin of ${fin?.operatingMargin ? (fin.operatingMargin*100).toFixed(1) + "%" : "average levels"} and revenue growth of ${fin?.revenueGrowth ? (fin.revenueGrowth*100).toFixed(1) + "%" : "steady rates"}. This supports a ${decision === "INVEST" ? "constructive capital allocation model" : decision === "HOLD" ? "neutral outlook" : "cautious outlook on growth acceleration"}.
2. **Valuation Profile:** Trading at a P/E multiple of ${fin?.peRatio ? fin.peRatio.toFixed(1) : "N/A"}, the market price reflects ${decision === "INVEST" ? "attractive entry levels relative to underlying earnings power" : decision === "HOLD" ? "fair valuation" : "stretched assumptions that carry higher execution risk"}.

### Market Sentiment

The market sentiment for ${state.companyName} is currently reflecting ${decision === "INVEST" ? "positive momentum" : decision === "HOLD" ? "mixed signals" : "cautious outlook"} based on recent developments and industry trends.

### Risks & Moat

${state.swot ? `**Moat / Strengths:**\n- ${state.swot.strengths.join("\n- ")}\n\n**Key Risks / Threats:**\n- ${state.swot.threats.join("\n- ")}` : "Qualitative moat and risk data not fully available."}
        `.trim();
      }

      return {
        scorecard,
        decision,
        reasoning,
        logs: logs.concat([
          `✅ Decision rendered: ${decision} (Score: ${scorecard.totalScore}/100)`,
          "🏁 Research completed successfully."
        ]),
      };
    }

    const financialsStr = JSON.stringify(state.financials || {}, null, 2);
    const swotStr = JSON.stringify(state.swot || {}, null, 2);
    const context = `
    Company: ${state.companyName} (${state.ticker})
    Financial Metrics: ${financialsStr}
    SWOT Grid: ${swotStr}
    Prior Analysis:
    ${state.marketAnalysis}
    `;

    const prompt = `You are the Chairman of the Investment Committee. You must review the complete analysis of ${state.companyName} (${state.ticker}) and render a final investment decision: INVEST, HOLD, or PASS.
    
    Context:
    ${context}
    
    Assign scores out of 20 points for each of the following 5 pillars (total 100 points):
    1. Growth Score (Pillar 1: Revenue growth rate, market expansion, product pipelines)
    2. Valuation Score (Pillar 2: P/E, PEG ratio, discount/premium vs intrinsic value)
    3. Quality Score (Pillar 3: ROIC, debt levels, cash flow generation, margin health)
    4. Moat Score (Pillar 4: Strength of competitive advantage, pricing power, brand)
    5. Risk Score (Pillar 5: Market/regulatory risks, competitor pressure, key-man dependency. High risk = low score; low risk = high score)
    
    Then, calculate the Total Score (Sum of above).
    
    Decide:
    - If Total Score >= 70, set decision to "INVEST".
    - If Total Score >= 40, set decision to "HOLD".
    - If Total Score < 40, set decision to "PASS".
    
    Provide the response in the following JSON format:
    {
      "scorecard": {
        "growthScore": 15,
        "valuationScore": 12,
        "qualityScore": 16,
        "moatScore": 14,
        "riskScore": 11,
        "totalScore": 68
      },
      "decision": "INVEST",
      "reasoning": "### Financial Health\\n\\n[Analysis of margins, growth, and valuation]\\n\\n### Market Sentiment\\n\\n[Analysis of market perception]\\n\\n### Risks & Moat\\n\\n[Summary of strengths and threats]"
    }
    
    Ensure "reasoning" uses proper markdown (headers, bullets) and that you output ONLY a valid JSON object.`;

    const response = await llm.invoke(prompt);
    const content = response.content as string;
    
    const result = parseJSONBlock<{
      scorecard: Scorecard;
      decision: "INVEST" | "PASS" | "HOLD";
      reasoning: string;
    }>(content);

    return {
      scorecard: result.scorecard,
      decision: result.decision,
      reasoning: result.reasoning,
      logs: logs.concat([
        `✅ Decision rendered: ${result.decision} (Score: ${result.scorecard.totalScore}/100)`,
        "🏁 Research completed successfully."
      ]),
    };
  } catch (error: any) {
    console.error("Error in decisionNode:", error);
    return {
      logs: logs.concat([`❌ Decision node failed: ${error.message || error}`]),
      error: `DecisionNode error: ${error.message || error}`,
    };
  }
}
