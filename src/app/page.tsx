"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Settings,
  TrendingUp,
  Award,
  DollarSign,
  Percent,
  Activity,
  FileText,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Key,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  Moon,
  Sun,
  Download,
  MessageSquare
} from "lucide-react";
import styles from "./page.module.css";
import { ResearchState, CompanyFinancials, SwotAnalysis, Scorecard } from "../lib/agent/state";

export default function InvestmentResearchPage() {
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  // Chat States
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  
  // API Keys configuration stored in state and persisted in localStorage
  const [apiKeys, setApiKeys] = useState({
    openaiApiKey: "",
    geminiApiKey: "",
    tavilyApiKey: "",
  });

  // Main result container
  const [result, setResult] = useState<ResearchState | null>(null);
  const [activeTab, setActiveTab] = useState<"financial" | "market">("financial");

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load API keys from localStorage on mount
  useEffect(() => {
    const savedKeys = localStorage.getItem("invest_agent_keys");
    if (savedKeys) {
      try {
        setApiKeys(JSON.parse(savedKeys));
      } catch (e) {
        console.error("Error loading keys from localStorage:", e);
      }
    }

    // Load Theme
    const savedTheme = localStorage.getItem("equisense_theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.add("light-theme");
      }
    }

    // Load Recent Searches
    const savedSearches = localStorage.getItem("equisense_recent_searches");
    if (savedSearches) {
      try {
        setRecentSearches(JSON.parse(savedSearches));
      } catch (e) {}
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("equisense_theme", newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
  };

  // Save API keys to localStorage
  const handleSaveKeys = () => {
    localStorage.setItem("invest_agent_keys", JSON.stringify(apiKeys));
    setShowConfig(false);
  };

  // Scroll terminal logs to bottom when updated
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Formats large numbers into readable financial representations (Millions/Billions)
  const formatLargeNumber = (num?: number | null, currency = "USD") => {
    if (num === null || num === undefined) return "N/A";
    const prefix = currency === "INR" ? "₹" : "$";
    if (num >= 1e12) return `${prefix}${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M`;
    return `${prefix}${num.toLocaleString()}`;
  };

  // Formats percentages (e.g. 0.15 -> 15.00%)
  const formatPercentage = (num?: number | null) => {
    if (num === null || num === undefined) return "N/A";
    return `${(num * 100).toFixed(2)}%`;
  };

  // Function to run research on a given company
  const startResearch = async (nameToResearch: string) => {
    if (!nameToResearch.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setChatMessages([]);
    setLogs(["🚀 Connecting to EquiSense AI Agent..."]);

    // Update recent searches
    if (nameToResearch.trim()) {
      const updated = [nameToResearch, ...recentSearches.filter(s => s !== nameToResearch)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem("equisense_recent_searches", JSON.stringify(updated));
    }

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName: nameToResearch,
          apiKeys: {
            openaiApiKey: apiKeys.openaiApiKey || undefined,
            geminiApiKey: apiKeys.geminiApiKey || undefined,
            tavilyApiKey: apiKeys.tavilyApiKey || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Internal Server Error running research.");
      }

      if (!response.body) {
        throw new Error("No readable stream response received from backend.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "");
            try {
              const stateUpdate: ResearchState = JSON.parse(dataStr);

              // Update logs
              if (stateUpdate.logs) {
                setLogs(stateUpdate.logs);
              }

              // Update error
              if (stateUpdate.error) {
                setError(stateUpdate.error);
                setLoading(false);
              }

              // Update result once we have decision & score
              if (stateUpdate.decision && stateUpdate.scorecard) {
                setResult(stateUpdate);
              }
            } catch (e) {
              console.error("Error parsing stream chunk:", e);
            }
          }
        }
      }
      setLoading(false);
    } catch (err: any) {
      console.error("Research failed:", err);
      setError(err.message || String(err));
      setLogs((prev) => [...prev, `❌ Error: ${err.message || String(err)}`]);
      setLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !result) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          context: result,
          apiKeys: {
            openaiApiKey: apiKeys.openaiApiKey || undefined,
            geminiApiKey: apiKeys.geminiApiKey || undefined,
          }
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Quick suggestion list
  const suggestions = ["NVIDIA", "Tesla", "Reliance Industries", "Apple", "GameStop", "Tata Motors"];

  // Inline markdown rendering helper for investment thesis
  const renderThesisMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");

    return lines.map((line, index) => {
      const trimmed = line.trim();
      
      // Parse headings
      if (trimmed.startsWith("### ")) {
        return (
          <h3 key={index} style={{ marginTop: "24px", marginBottom: "8px", color: "var(--color-text-primary)", fontWeight: "bold" }}>
            {trimmed.replace("### ", "")}
          </h3>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h2 key={index} style={{ marginTop: "32px", marginBottom: "12px", color: "var(--color-text-primary)", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "6px" }}>
            {trimmed.replace("## ", "")}
          </h2>
        );
      }
      
      // Parse list items
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={index} style={{ marginLeft: "20px", marginBottom: "6px" }}>
            {parseInlineMarkdown(trimmed.substring(2))}
          </li>
        );
      }

      // Empty line
      if (trimmed === "") {
        return <div key={index} style={{ height: "8px" }} />;
      }

      // Standard paragraph
      return (
        <p key={index} style={{ marginBottom: "12px" }}>
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    });
  };

  // Helper to parse bold tags **word** in markdown strings
  const parseInlineMarkdown = (text: string) => {
    const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} style={{ color: "var(--color-text-primary)" }}>{part}</strong>;
      }
      return part;
    });
  };

  // Calculates the current research phase based on log output
  const getActiveStep = () => {
    if (logs.length === 0) return 0;
    const lastLog = logs[logs.length - 1];
    if (lastLog.includes("⚖️") || lastLog.includes("decision") || lastLog.includes("🏁")) return 5;
    if (lastLog.includes("📋") || lastLog.includes("SWOT")) return 4;
    if (lastLog.includes("🌍") || lastLog.includes("moat") || lastLog.includes("market")) return 3;
    if (lastLog.includes("🔬") || lastLog.includes("financial")) return 2;
    return 1; // gatherData
  };

  const activeStep = getActiveStep();

  return (
    <div className="container">
      <div className={styles.mainContainer}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <TrendingUp size={24} style={{ color: "var(--color-primary)" }} />
            <span>EquiSense AI</span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className={styles.settingsBtn}
              onClick={toggleTheme}
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className={`${styles.settingsBtn} ${showConfig ? styles.active : ""}`}
              onClick={() => setShowConfig(!showConfig)}
              title="Configure API Keys"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Configuration Drawer */}
        {showConfig && (
          <div className={`${styles.settingsPanel} glass-panel`}>
            <div>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem" }}>
                <Key size={18} style={{ color: "var(--color-primary)" }} />
                <span>API Settings Configuration</span>
              </h3>
              <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                Configure custom keys. If left blank, the agent will fallback to the server environment keys.
              </p>
            </div>

            <div className={styles.settingsGrid}>
              <div className={styles.inputGroup}>
                <label>OpenAI API Key</label>
                <div className={styles.inputWithIcon}>
                  <Key className={styles.inputIcon} size={16} />
                  <input
                    type="password"
                    placeholder="sk-..."
                    className={styles.settingsInput}
                    value={apiKeys.openaiApiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, openaiApiKey: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>Gemini API Key</label>
                <div className={styles.inputWithIcon}>
                  <Key className={styles.inputIcon} size={16} />
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    className={styles.settingsInput}
                    value={apiKeys.geminiApiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, geminiApiKey: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label>Tavily Search API Key (Optional)</label>
                <div className={styles.inputWithIcon}>
                  <Key className={styles.inputIcon} size={16} />
                  <input
                    type="password"
                    placeholder="tvly-..."
                    className={styles.settingsInput}
                    value={apiKeys.tavilyApiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, tavilyApiKey: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveKeys}>
                Save Config
              </button>
            </div>
          </div>
        )}

        {/* Landing / Search Section */}
        {!result && (
          <div className={styles.heroSection}>
            <div style={{ margin: "0 auto", display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", textTransform: "uppercase", padding: "4px 8px", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "6px", color: "var(--color-primary)", fontWeight: "bold" }}>
                Multi-Node LangGraph AI
              </span>
            </div>
            <h1 className={styles.heroTitle}>EquiSense AI</h1>
            <p className={styles.heroSubtitle}>
              Data-Driven Intelligence for Smarter Investments.
            </p>

            {!loading && (
              <>
                <div className={styles.searchContainer}>
                  <div className={styles.searchWrapper}>
                    <Search className={styles.searchIcon} size={20} />
                    <input
                      type="text"
                      placeholder="e.g. Nvidia, Reliance Industries, Tesla..."
                      className={styles.searchInput}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && startResearch(companyName)}
                    />
                  </div>
                  <button className={styles.submitBtn} onClick={() => startResearch(companyName)}>
                    <Search size={20} />
                  </button>
                </div>

                {recentSearches.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    <span>Recent Searches: </span>
                    <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap", verticalAlign: "middle", marginLeft: "4px" }}>
                      {recentSearches.map((s) => (
                        <span
                          key={s}
                          onClick={() => {
                            setCompanyName(s);
                            startResearch(s);
                          }}
                          style={{ cursor: "pointer", padding: "2px 8px", background: "rgba(255,255,255,0.05)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.suggestions} style={{ marginTop: "24px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", width: "100%", display: "block", marginBottom: "4px" }}>Try these examples:</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      className={styles.suggestionPill}
                      onClick={() => {
                        setCompanyName(s);
                        startResearch(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Feature Quadrants (Landing Page details) */}
                <div className={styles.featuresGrid}>
                  <div className={`${styles.featureCard} glass-panel`}>
                    <div className={styles.featureIcon}>
                      <TrendingUp size={20} />
                    </div>
                    <h4 className={styles.featureTitle}>Financial Analysis</h4>
                    <p className={styles.featureDesc}>
                      Analyzes metrics like P/E ratio, profit margins, debt ratios, revenue growth, and free cash flows from Yahoo Finance.
                    </p>
                  </div>

                  <div className={`${styles.featureCard} glass-panel`}>
                    <div className={styles.featureIcon}>
                      <Activity size={20} />
                    </div>
                    <h4 className={styles.featureTitle}>Moat & Strategy</h4>
                    <p className={styles.featureDesc}>
                      Evaluates the qualitative aspect: switching costs, industry trends, competitor landscape, and entry barriers.
                    </p>
                  </div>

                  <div className={`${styles.featureCard} glass-panel`}>
                    <div className={styles.featureIcon}>
                      <FileText size={20} />
                    </div>
                    <h4 className={styles.featureTitle}>SWOT Synthesis</h4>
                    <p className={styles.featureDesc}>
                      Compiles a detailed 2x2 grid representing core Strengths, Weaknesses, Opportunities, and Threats.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Loading and Stepper Section */}
        {loading && (
          <div className={styles.loadingContainer}>
            <div className={`${styles.progressHeader} glass-panel`} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className={styles.activeStepText}>
                  {activeStep === 1 && "Phase 1: Gathering Stock & News Data..."}
                  {activeStep === 2 && "Phase 2: Analyzing Financial Ratios..."}
                  {activeStep === 3 && "Phase 3: Assessing Moat & Competitors..."}
                  {activeStep === 4 && "Phase 4: Structuring SWOT Matrix..."}
                  {activeStep === 5 && "Phase 5: Simulating Investment Committee..."}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                  Analyzing {companyName}
                </span>
              </div>
              <div className={styles.spinnerWrapper}>
                <RefreshCw className="animate-spin-slow" size={20} style={{ color: "var(--color-primary)" }} />
              </div>
            </div>

            {/* Visual Stepper */}
            <div style={{ display: "flex", justifySelf: "center", justifyContent: "space-between", margin: "10px 0", position: "relative" }}>
              {[1, 2, 3, 4, 5].map((step) => (
                <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "16%" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.95rem",
                      fontWeight: "bold",
                      zIndex: 2,
                      transition: "all 0.3s ease",
                      border: step <= activeStep ? "2px solid var(--color-primary)" : "2px solid rgba(255,255,255,0.08)",
                      background: step < activeStep 
                        ? "var(--color-primary)" 
                        : step === activeStep 
                          ? "rgba(99,102,241,0.2)" 
                          : "var(--bg-secondary)",
                      color: step < activeStep ? "#fff" : "var(--color-text-primary)",
                    }}
                  >
                    {step < activeStep ? "✓" : step}
                  </div>
                  <span style={{ fontSize: "0.7rem", textAlign: "center", color: step <= activeStep ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                    {step === 1 && "Data"}
                    {step === 2 && "Financials"}
                    {step === 3 && "Moat"}
                    {step === 4 && "SWOT"}
                    {step === 5 && "Decision"}
                  </span>
                </div>
              ))}
              <div
                style={{
                  position: "absolute",
                  top: "18px",
                  left: "8%",
                  right: "8%",
                  height: "2px",
                  background: "rgba(255,255,255,0.08)",
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--color-primary)",
                    width: `${((activeStep - 1) / 4) * 100}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* Error Message Box */}
            {error && (
              <div className="glass-panel" style={{ padding: "16px", borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)", display: "flex", gap: "12px", alignItems: "center" }}>
                <AlertTriangle size={20} style={{ color: "var(--color-danger)" }} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "var(--color-text-primary)" }}>Agent Analysis Error</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>{error}</span>
                </div>
              </div>
            )}

            {/* Real-time Agent Thoughts Console */}
            <div>
              <span style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-text-secondary)", marginBottom: "6px", display: "block" }}>
                AGENT THINKING LOGS
              </span>
              <div className={styles.terminalConsole}>
                {logs.map((log, index) => (
                  <div key={index} className={styles.terminalLine}>
                    <span>[{index + 1}]</span>
                    <div>{log}</div>
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* Results Page */}
        {!loading && result && (
          <div className={styles.mainContainer} style={{ padding: 0, animation: "fadeIn 0.5s ease" }}>
            {/* Header info / Search another */}
            <div className={styles.resultsHeader}>
              <div className={styles.resultsTitleArea}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h1 className={styles.companyTitle}>
                    {result.financials?.longName || result.companyName}
                  </h1>
                  {result.ticker && <span className={styles.tickerBadge}>{result.ticker}</span>}
                </div>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                  {result.financials?.sector ? `${result.financials.sector} · ${result.financials.industry}` : "Investment Committee Analysis Result"}
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255, 255, 255, 0.05)", borderRadius: "8px", padding: "4px 8px", marginRight: "12px" }}>
                  <Search size={16} style={{ color: "var(--color-text-muted)", marginRight: "8px" }} />
                  <input 
                    type="text" 
                    placeholder="Search another..." 
                    style={{ background: "transparent", border: "none", outline: "none", color: "var(--color-text-primary)", fontSize: "0.9rem", width: "140px" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                        setCompanyName(e.currentTarget.value);
                        startResearch(e.currentTarget.value);
                      }
                    }}
                  />
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handlePrint}
                >
                  <Download size={16} />
                  Export as PDF
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setResult(null);
                    setCompanyName("");
                    setChatMessages([]);
                  }}
                >
                  Analyze Another
                </button>
              </div>
            </div>

            {/* Verdict glow block */}
            <div className={`${styles.verdictBox} ${result.decision === "INVEST" ? styles.invest : result.decision === "HOLD" ? styles.hold : styles.pass}`}>
              <div className={styles.verdictBadge}>
                {result.decision === "INVEST" ? (
                  <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "16px", borderRadius: "50%", boxShadow: "0 0 20px rgba(16, 185, 129, 0.2)" }}>
                    <ShieldCheck size={38} style={{ color: "var(--color-success)" }} />
                  </div>
                ) : result.decision === "HOLD" ? (
                  <div style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "16px", borderRadius: "50%", boxShadow: "0 0 20px rgba(245, 158, 11, 0.2)" }}>
                    <ShieldAlert size={38} style={{ color: "var(--color-warning)" }} />
                  </div>
                ) : (
                  <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "16px", borderRadius: "50%", boxShadow: "0 0 20px rgba(239, 68, 68, 0.2)" }}>
                    <ShieldAlert size={38} style={{ color: "var(--color-danger)" }} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                    RECOMMENDATION VERDICT
                  </div>
                  <span className={styles.verdictText}>{result.decision}</span>
                </div>
              </div>

              <div className={styles.scoreWrapper}>
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <span className={styles.scoreValue}>{result.scorecard?.totalScore}</span>
                  <span style={{ fontSize: "1.2rem", color: "var(--color-text-muted)", fontWeight: "bold" }}>/100</span>
                </div>
                <span className={styles.scoreLabel}>Agent Consensus Score</span>
              </div>
            </div>

            {/* Scorecard breakdown by pillars */}
            {result.scorecard && (
              <div className="glass-panel" style={{ padding: "20px 24px" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
                  Pillar Scoring Breakdown
                </h4>
                <div className={styles.pillarsGrid}>
                  <div className={`${styles.pillarCard} glass-panel`}>
                    <span className={styles.pillarName}>Growth</span>
                    <div className={styles.pillarScoreRing}>
                      {/* SVG circle meter */}
                      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="transparent" />
                        <circle
                          cx="30" cy="30" r="26"
                          stroke="var(--color-primary)" strokeWidth="4" fill="transparent"
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - result.scorecard.growthScore / 20)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span className={styles.pillarScoreText}>{result.scorecard.growthScore}</span>
                        <span className={styles.pillarScoreSubtext}>/20</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.pillarCard} glass-panel`}>
                    <span className={styles.pillarName}>Valuation</span>
                    <div className={styles.pillarScoreRing}>
                      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="transparent" />
                        <circle
                          cx="30" cy="30" r="26"
                          stroke="var(--color-primary)" strokeWidth="4" fill="transparent"
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - result.scorecard.valuationScore / 20)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span className={styles.pillarScoreText}>{result.scorecard.valuationScore}</span>
                        <span className={styles.pillarScoreSubtext}>/20</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.pillarCard} glass-panel`}>
                    <span className={styles.pillarName}>Quality</span>
                    <div className={styles.pillarScoreRing}>
                      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="transparent" />
                        <circle
                          cx="30" cy="30" r="26"
                          stroke="var(--color-primary)" strokeWidth="4" fill="transparent"
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - result.scorecard.qualityScore / 20)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span className={styles.pillarScoreText}>{result.scorecard.qualityScore}</span>
                        <span className={styles.pillarScoreSubtext}>/20</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.pillarCard} glass-panel`}>
                    <span className={styles.pillarName}>Moat</span>
                    <div className={styles.pillarScoreRing}>
                      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="transparent" />
                        <circle
                          cx="30" cy="30" r="26"
                          stroke="var(--color-primary)" strokeWidth="4" fill="transparent"
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - result.scorecard.moatScore / 20)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span className={styles.pillarScoreText}>{result.scorecard.moatScore}</span>
                        <span className={styles.pillarScoreSubtext}>/20</span>
                      </div>
                    </div>
                  </div>

                  <div className={`${styles.pillarCard} glass-panel`}>
                    <span className={styles.pillarName}>Risk Protection</span>
                    <div className={styles.pillarScoreRing}>
                      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="transparent" />
                        <circle
                          cx="30" cy="30" r="26"
                          stroke="var(--color-primary)" strokeWidth="4" fill="transparent"
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - result.scorecard.riskScore / 20)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span className={styles.pillarScoreText}>{result.scorecard.riskScore}</span>
                        <span className={styles.pillarScoreSubtext}>/20</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard main layout grid */}
            <div className={styles.dashboardGrid}>
              
              {/* LEFT COLUMN: FINANCIAL INFO & SWOT */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Financial metrics scorecard */}
                <div className="glass-panel" style={{ padding: "20px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px", marginBottom: "16px" }}>
                    Key Financial Statistics
                  </h3>
                  <div className={styles.metricsGrid}>
                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>Market Capitalization</span>
                      <span className={styles.metricValue}>
                        {formatLargeNumber(result.financials?.marketCap, result.financials?.currency)}
                      </span>
                    </div>

                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>Stock Price</span>
                      <span className={styles.metricValue}>
                        {result.financials?.currentPrice 
                          ? `${result.financials.currency === "INR" ? "₹" : "$"}${result.financials.currentPrice.toLocaleString()}`
                          : "N/A"}
                      </span>
                      {result.financials?.fiftyTwoWeekHigh && (
                        <span className={styles.metricSubtext}>
                          Range: {result.financials.fiftyTwoWeekLow?.toFixed(1)} - {result.financials.fiftyTwoWeekHigh?.toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>P/E Ratio</span>
                      <span className={styles.metricValue}>
                        {result.financials?.peRatio ? result.financials.peRatio.toFixed(2) : "N/A"}
                      </span>
                      {result.financials?.forwardPE && (
                        <span className={styles.metricSubtext}>
                          Forward P/E: {result.financials.forwardPE.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>Revenue Growth</span>
                      <span className={styles.metricValue} style={{ color: (result.financials?.revenueGrowth ?? 0) >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                        {formatPercentage(result.financials?.revenueGrowth)}
                      </span>
                    </div>

                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>Operating Margin</span>
                      <span className={styles.metricValue}>
                        {formatPercentage(result.financials?.operatingMargin)}
                      </span>
                      {result.financials?.profitMargin && (
                        <span className={styles.metricSubtext}>
                          Net Margin: {formatPercentage(result.financials.profitMargin)}
                        </span>
                      )}
                    </div>

                    <div className={`${styles.metricCard} glass-panel`}>
                      <span className={styles.metricLabel}>Debt / Equity</span>
                      <span className={styles.metricValue}>
                        {result.financials?.debtToEquity !== null && result.financials?.debtToEquity !== undefined
                          ? `${result.financials.debtToEquity.toFixed(2)}%`
                          : "N/A"}
                      </span>
                      <span className={styles.metricSubtext}>
                        FCF: {result.financials?.freeCashFlow ? formatLargeNumber(result.financials.freeCashFlow, result.financials.currency) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SWOT quadrants */}
                {result.swot && (
                  <div className="glass-panel" style={{ padding: "20px" }}>
                    <div className={styles.swotHeader}>
                      <Award size={18} style={{ color: "var(--color-primary)" }} />
                      <span>SWOT Analysis</span>
                    </div>

                    <div className={styles.swotGrid}>
                      <div className={`${styles.swotQuadrant} glass-panel`}>
                        <div className={`${styles.swotQuadrantHeader} styles.strengthsHeader`}>
                          <span>Strengths</span>
                        </div>
                        <ul className={`${styles.swotList} ${styles.strengthsList}`}>
                          {result.swot.strengths.map((pt, i) => <li key={i}>{pt}</li>)}
                        </ul>
                      </div>

                      <div className={`${styles.swotQuadrant} glass-panel`}>
                        <div className={`${styles.swotQuadrantHeader} styles.weaknessesHeader`}>
                          <span>Weaknesses</span>
                        </div>
                        <ul className={`${styles.swotList} ${styles.weaknessesList}`}>
                          {result.swot.weaknesses.map((pt, i) => <li key={i}>{pt}</li>)}
                        </ul>
                      </div>

                      <div className={`${styles.swotQuadrant} glass-panel`}>
                        <div className={`${styles.swotQuadrantHeader} styles.opportunitiesHeader`}>
                          <span>Opportunities</span>
                        </div>
                        <ul className={`${styles.swotList} ${styles.opportunitiesList}`}>
                          {result.swot.opportunities.map((pt, i) => <li key={i}>{pt}</li>)}
                        </ul>
                      </div>

                      <div className={`${styles.swotQuadrant} glass-panel`}>
                        <div className={`${styles.swotQuadrantHeader} styles.threatsHeader`}>
                          <span>Threats</span>
                        </div>
                        <ul className={`${styles.swotList} ${styles.threatsList}`}>
                          {result.swot.threats.map((pt, i) => <li key={i}>{pt}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: DETAILED ANALYSIS & THESIS */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {/* Qualitative tabs */}
                <div className="glass-panel" style={{ padding: "24px" }}>
                  <div className={styles.tabContainer}>
                    <div className={styles.tabList}>
                      <button
                        className={`${styles.tabButton} ${activeTab === "financial" ? styles.tabButtonActive : ""}`}
                        onClick={() => setActiveTab("financial")}
                      >
                        Analyst Commentary
                      </button>
                    </div>

                    <div className={styles.tabContent}>
                      {result.marketAnalysis ? (
                        <div style={{ whiteSpace: "pre-line" }} className={styles.thesisBody}>
                          {renderThesisMarkdown(result.marketAnalysis)}
                        </div>
                      ) : (
                        <p>No qualitative commentary compiled.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Core Recommendation & Thesis markdown */}
                <div className={`${styles.thesisBox} glass-panel`}>
                  <div className={styles.thesisHeader}>
                    <FileText size={18} style={{ color: "var(--color-primary)" }} />
                    <span>Investment Committee Thesis</span>
                  </div>
                  <div className={styles.thesisBody}>
                    {renderThesisMarkdown(result.reasoning)}
                  </div>
                </div>

                {/* News & Scraped references */}
                {result.news && result.news.length > 0 && (
                  <div className={`${styles.sourcesSection} glass-panel`}>
                    <div className={styles.sourcesHeader}>
                      <Info size={16} style={{ color: "var(--color-primary)" }} />
                      <span>Scraped Consensus References & News</span>
                    </div>
                    <div className={styles.sourcesList}>
                      {result.news.slice(0, 4).map((item, index) => (
                        <div key={index} className={styles.sourceItem}>
                          <span className={styles.sourceTitle}>{item.title}</span>
                          <p style={{ fontSize: "0.75rem", margin: "2px 0 6px 0", color: "var(--color-text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {item.snippet}
                          </p>
                          <div className={styles.sourceMeta}>
                            <span>{item.source || "Web"}</span>
                            {item.link && (
                              <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                                <span>Link</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Follow up chat section */}
              <div className="glass-panel" style={{ padding: "24px", marginTop: "24px", gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "1.1rem", fontWeight: "bold" }}>
                  <MessageSquare size={18} style={{ color: "var(--color-primary)" }} />
                  <span>Ask a follow-up question</span>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px", maxHeight: "300px", overflowY: "auto" }}>
                  {chatMessages.length === 0 && (
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Ask EquiSense AI anything about the report above (e.g. &quot;Why did you think their debt was a problem?&quot;)</p>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} style={{ 
                      padding: "12px 16px", 
                      borderRadius: "12px", 
                      background: msg.role === "user" ? "rgba(255,255,255,0.05)" : "rgba(99, 102, 241, 0.1)", 
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      border: msg.role === "assistant" ? "1px solid rgba(99, 102, 241, 0.2)" : "none"
                    }}>
                      <span style={{ fontSize: "0.95rem", color: "var(--color-text-primary)", whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </span>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ padding: "12px 16px", borderRadius: "12px", background: "rgba(99, 102, 241, 0.1)", alignSelf: "flex-start" }}>
                      <span style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Thinking...</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="text" 
                    className={styles.searchInput} 
                    style={{ padding: "12px 16px", fontSize: "0.95rem" }} 
                    placeholder="Type your question..." 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleChatSubmit()}
                  />
                  <button className="btn btn-primary" onClick={handleChatSubmit} disabled={chatLoading}>
                    Send
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <p>© 2026 EquiSense AI</p>
          <p style={{ marginTop: "4px", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            Built for take-home intern assignment. Mandated agent logs and pipeline tracking enabled.
          </p>
        </footer>
      </div>
    </div>
  );
}
