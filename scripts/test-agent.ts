import fs from "fs";
import path from "path";
import { runResearch } from "../src/lib/agent/graph";

// Simple self-contained .env parser to load API keys
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index > 0) {
          const key = trimmed.substring(0, index).trim();
          let value = trimmed.substring(index + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          process.env[key] = value;
        }
      }
      console.log("📝 Loaded local .env file keys successfully.");
    }
  } catch (error) {
    console.error("⚠️ Failed to load local .env:", error);
  }
}

async function main() {
  loadEnv();

  const company = process.argv[2] || "Nvidia";
  console.log(`\n🤖 Starting Investment Research Agent for: "${company}"`);
  console.log("==================================================");

  try {
    const result = await runResearch(
      company,
      {
        openaiApiKey: process.env.OPENAI_API_KEY,
        geminiApiKey: process.env.GEMINI_API_KEY,
        tavilyApiKey: process.env.TAVILY_API_KEY,
      },
      (stateUpdate) => {
        // Output new logs as they appear
        if (stateUpdate.logs && stateUpdate.logs.length > 0) {
          const latestLog = stateUpdate.logs[stateUpdate.logs.length - 1];
          console.log(`[Agent Update] ${latestLog}`);
        }
      }
    );

    console.log("\n==================================================");
    console.log("🏁 Research Workflow Finished!");
    console.log("==================================================");

    if (result.error) {
      console.error(`❌ Agent Error encountered: ${result.error}`);
      return;
    }

    console.log(`\n🏢 Resolved Company Name: ${result.financials?.longName || result.companyName}`);
    console.log(`📊 Stock Ticker: ${result.ticker || "N/A"}`);
    console.log(`💰 Current Stock Price: ${result.financials?.currentPrice ? result.financials.currentPrice + " " + result.financials.currency : "N/A"}`);
    console.log(`📉 Valuation (P/E Ratio): ${result.financials?.peRatio || "N/A"}`);
    console.log(`📈 Revenue Growth: ${result.financials?.revenueGrowth ? (result.financials.revenueGrowth * 100).toFixed(2) + "%" : "N/A"}`);
    
    console.log("\n⚖️ Investment Verdict:");
    console.log("------------------------");
    const verdictStyle = result.decision === "INVEST" ? "\x1b[32mINVEST\x1b[0m" : "\x1b[31mPASS\x1b[0m";
    console.log(`Verdict: ${verdictStyle}`);
    console.log(`Consensus Score: ${result.scorecard?.totalScore}/100`);

    if (result.scorecard) {
      console.log(`- Growth Pillar: ${result.scorecard.growthScore}/20`);
      console.log(`- Valuation Pillar: ${result.scorecard.valuationScore}/20`);
      console.log(`- Quality Pillar: ${result.scorecard.qualityScore}/20`);
      console.log(`- Moat Pillar: ${result.scorecard.moatScore}/20`);
      console.log(`- Risk Protection: ${result.scorecard.riskScore}/20`);
    }

    if (result.swot) {
      console.log("\n📋 SWOT Synthesis Highlights:");
      console.log("------------------------");
      console.log(`Strengths: ${result.swot.strengths.slice(0, 2).join(", ")}`);
      console.log(`Weaknesses: ${result.swot.weaknesses.slice(0, 2).join(", ")}`);
      console.log(`Opportunities: ${result.swot.opportunities.slice(0, 2).join(", ")}`);
      console.log(`Threats: ${result.swot.threats.slice(0, 2).join(", ")}`);
    }

    console.log("\n📑 Investment Thesis reasoning:");
    console.log("------------------------");
    console.log(result.reasoning);
  } catch (error) {
    console.error("❌ Execution crashed:", error);
  }
}

main();
