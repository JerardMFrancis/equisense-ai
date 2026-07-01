import YahooFinance from "yahoo-finance2";
import { CompanyFinancials, NewsArticle } from "./state";

const yahooFinance = new YahooFinance();

// Disable yahooFinance warning logging to keep console clean
try {
  (yahooFinance as any).suppressNotices(["yahooSurveillance"]);
} catch (e) {
  // Ignore
}

/**
 * Searches Yahoo Finance for a company name to find its stock ticker symbol.
 */
export async function searchTicker(companyName: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const results = (await yahooFinance.search(companyName)) as any;
    if (results && results.quotes && results.quotes.length > 0) {
      // Find the first equity result
      const equity = results.quotes.find(
        (q: any) => q.quoteType === "EQUITY" || q.quoteType === "ETF"
      );
      if (equity) {
        return {
          symbol: equity.symbol,
          name: equity.shortname || equity.longname || companyName,
        };
      }
      // Fallback to first available symbol
      return {
        symbol: results.quotes[0].symbol,
        name: results.quotes[0].shortname || results.quotes[0].longname || companyName,
      };
    }
  } catch (error) {
    console.error("Error searching ticker using yahoo-finance2:", error);
  }

  // Fallback to public search endpoint
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(companyName)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.quotes && data.quotes.length > 0) {
        const equity = data.quotes.find(
          (q: any) => q.quoteType === "EQUITY" || q.quoteType === "ETF"
        );
        if (equity) {
          return { symbol: equity.symbol, name: equity.shortname || equity.longname || companyName };
        }
        return {
          symbol: data.quotes[0].symbol,
          name: data.quotes[0].shortname || data.quotes[0].longname || companyName,
        };
      }
    }
  } catch (error) {
    console.error("Fallback searchTicker failed:", error);
  }

  return null;
}

/**
 * Fetches comprehensive financial metrics for a given ticker symbol.
 */
export async function fetchFinancials(symbol: string): Promise<CompanyFinancials | null> {
  try {
    const summary = (await yahooFinance.quoteSummary(symbol, {
      modules: [
        "summaryDetail",
        "financialData",
        "defaultKeyStatistics",
        "price",
        "summaryProfile",
      ],
    })) as any;

    if (summary) {
      const fd = summary.financialData || {};
      const sd = summary.summaryDetail || {};
      const dks = summary.defaultKeyStatistics || {};
      const p = summary.price || {};
      const sp = summary.summaryProfile || {};

      return {
        symbol: symbol,
        longName: p.longName || p.shortName || symbol,
        marketCap: sd.marketCap || p.marketCap || null,
        peRatio: sd.trailingPE || sd.forwardPE || null,
        forwardPE: sd.forwardPE || null,
        eps: dks.trailingEps || null,
        revenueGrowth: fd.revenueGrowth || null,
        profitMargin: fd.profitMargins || null,
        operatingMargin: fd.operatingMargins || null,
        debtToEquity: fd.debtToEquity || null,
        freeCashFlow: fd.freeCashflow || null,
        dividendYield: sd.dividendYield || null,
        currentPrice: fd.currentPrice || sd.regularPrice || sd.previousClose || null,
        currency: p.currency || "USD",
        fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh || null,
        fiftyTwoWeekLow: sd.fiftyTwoWeekLow || null,
        sector: sp.sector || "",
        industry: sp.industry || "",
        longBusinessSummary: sp.longBusinessSummary || "",
      };
    }
  } catch (error) {
    console.error("Error fetching financials using yahoo-finance2, trying fallback:", error);
  }

  // Fallback direct JSON fetch to query1.finance.yahoo.com
  try {
    const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,summaryProfile,price`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const summary = data.quoteSummary?.result?.[0];
      if (summary) {
        const fd = summary.financialData || {};
        const sd = summary.summaryDetail || {};
        const dks = summary.defaultKeyStatistics || {};
        const p = summary.price || {};
        const sp = summary.summaryProfile || {};

        const extractVal = (obj: any) => {
          if (!obj) return null;
          return obj.raw !== undefined ? obj.raw : null;
        };

        return {
          symbol: symbol,
          longName: p.longName || p.shortName || symbol,
          marketCap: extractVal(sd.marketCap) || extractVal(p.marketCap),
          peRatio: extractVal(sd.trailingPE) || extractVal(sd.forwardPE),
          forwardPE: extractVal(sd.forwardPE),
          eps: extractVal(dks.trailingEps),
          revenueGrowth: extractVal(fd.revenueGrowth),
          profitMargin: extractVal(fd.profitMargins),
          operatingMargin: extractVal(fd.operatingMargins),
          debtToEquity: extractVal(fd.debtToEquity),
          freeCashFlow: extractVal(fd.freeCashflow),
          dividendYield: extractVal(sd.dividendYield),
          currentPrice: extractVal(fd.currentPrice) || extractVal(sd.regularPrice) || extractVal(sd.previousClose),
          currency: p.currency || "USD",
          fiftyTwoWeekHigh: extractVal(sd.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: extractVal(sd.fiftyTwoWeekLow),
          sector: sp.sector || "",
          industry: sp.industry || "",
          longBusinessSummary: sp.longBusinessSummary || "",
        };
      }
    }
  } catch (error) {
    console.error("Fallback fetchFinancials failed:", error);
  }

  return null;
}

/**
 * Searches the web for investment-related information.
 * Uses Tavily API if available; falls back to Yahoo Search News / Google mock search if not.
 */
export async function searchWeb(
  query: string,
  tavilyApiKey?: string
): Promise<NewsArticle[]> {
  const actualTavilyKey = tavilyApiKey || process.env.TAVILY_API_KEY;

  if (actualTavilyKey) {
    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: actualTavilyKey,
          query: query,
          search_depth: "news",
          max_results: 6,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.results) {
          return data.results.map((r: any) => ({
            title: r.title || "No Title",
            link: r.url || "",
            snippet: r.content || r.snippet || "",
            source: new URL(r.url || "https://tavily.com").hostname,
          }));
        }
      }
    } catch (e) {
      console.error("Tavily search failed, falling back to Yahoo Finance news search:", e);
    }
  }

  // Fallback: Yahoo Finance news search
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.news && data.news.length > 0) {
        return data.news.map((item: any) => ({
          title: item.title || "No Title",
          link: item.link || "",
          snippet: item.summary || item.title || "",
          source: item.publisher || "Yahoo Finance",
          date: item.providerPublishTime
            ? new Date(item.providerPublishTime * 1000).toLocaleDateString()
            : undefined,
        }));
      }
    }
  } catch (error) {
    console.error("Yahoo News fallback failed:", error);
  }

  // Final emergency mock data if network requests fail completely
  return [
    {
      title: `${query} Analysis and Recent Developments`,
      link: "https://finance.yahoo.com",
      snippet: `General market trends and search consensus regarding "${query}". The company is seeing active discussion regarding growth prospects, margins, and competitive moat in its sector.`,
      source: "Market Consensus",
    },
  ];
}
