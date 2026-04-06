"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Circular {
  id: string;
  source: string;
  title: string;
  link: string;
  date: string;
  created_at: string;
  content: string | null;
  summary: string | null;
  relevance: string | null;
  why_it_matters: string | null;
  action_items: string | null;
  evidence: string | null;
  is_pdf: number | null;
  extracted_text: string | null;
  structured_chunks: string | null;
  reviewed: number | null; // 1 = reviewed in DB
}

interface ChatEvidence {
  text: string;
  section: string;
  page: number;
}

interface ChatResponse {
  answer: string;
  evidence: ChatEvidence[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "OK" | "DEGRADED" | "INSUFFICIENT_EVIDENCE";
}

interface ChatState {
  response: ChatResponse | null;
  loading: boolean;
  error: string | null;
}

type RelevanceFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW" | "NOT RELEVANT";
type ReviewFilter = "all" | "unreviewed" | "reviewed";

interface SourceHealth {
  source: string;
  status: "ok" | "empty" | "error" | "blocked";
  count: number;
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseList(json: string | null): string[] {
  try {
    const p = JSON.parse(json || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function formatDate(str: string): string {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str.split("T")[0] ?? str;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function hasDocContent(c: Circular): boolean {
  return !!(c.structured_chunks || c.extracted_text || c.content);
}

function formatTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Design tokens ──────────────────────────────────────────────────────────

const RELEVANCE_DOT: Record<string, string> = {
  HIGH: "#D94F43",
  MEDIUM: "#C4821A",
  LOW: "#9CA3AF",
  "NOT RELEVANT": "#D1D5DB",
};

const SOURCE_COLOR: Record<string, string> = {
  RBI: "#2563EB",
  IFSCA: "#7C3AED",
  MCA: "#059669",
  FATF: "#B45309",
  SEBI: "#0F766E",
};

const CONFIDENCE_STYLE: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: "#ECFDF5", color: "#065F46" },
  MEDIUM: { bg: "#FFFBEB", color: "#92400E" },
  LOW: { bg: "#F3F4F6", color: "#6B7280" },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function RelevanceDot({ relevance }: { relevance: string | null }) {
  return (
    <span
      style={{
        display: "block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: RELEVANCE_DOT[relevance ?? ""] ?? "#D1D5DB",
        flexShrink: 0,
        marginTop: 7,
      }}
    />
  );
}

function SourceTag({ source }: { source: string }) {
  const c = SOURCE_COLOR[source] ?? "#6E6E73";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: c,
        background: `${c}14`,
        padding: "2px 7px",
        borderRadius: 5,
      }}
    >
      {source}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 7px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#9CA3AF",
      }}
    >
      {children}
    </p>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const s = CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE.LOW;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
      }}
    >
      {confidence} confidence
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DEGRADED: "Fallback provider",
    INSUFFICIENT_EVIDENCE: "Limited evidence",
  };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 4,
        background: "#FEF2F2",
        color: "#991B1B",
      }}
    >
      {map[status] ?? status}
    </span>
  );
}

// ─── Document Chat ──────────────────────────────────────────────────────────

function DocumentChat({
  circularId,
  chatState,
  onAsk,
  onClear,
}: {
  circularId: string;
  chatState: ChatState | undefined;
  onAsk: (question: string) => void;
  onClear: () => void;
}) {
  const [input, setInput] = useState("");
  const state = chatState ?? { response: null, loading: false, error: null };

  const submit = () => {
    const q = input.trim();
    if (!q || state.loading) return;
    onAsk(q);
    setInput("");
  };

  return (
    <section>
      <div style={{ borderTop: "1px solid #F0F0F3", paddingTop: 18, marginTop: 2 }}>
        <SectionLabel>Ask This Document</SectionLabel>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            onClick={(e) => e.stopPropagation()}
            placeholder="Ask about this document…"
            disabled={state.loading}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 13,
              border: "1px solid #D2D2D7",
              borderRadius: 8,
              outline: "none",
              background: "#FFFFFF",
              color: "#1D1D1F",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            disabled={state.loading || !input.trim()}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 500,
              background: state.loading || !input.trim() ? "#D2D2D7" : "#1D1D1F",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              cursor: state.loading || !input.trim() ? "default" : "pointer",
              transition: "background 150ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {state.loading ? "Thinking…" : "Ask"}
          </button>
        </div>

        {/* Error */}
        {state.error && (
          <p style={{ fontSize: 12, color: "#D94F43", marginTop: 8 }}>{state.error}</p>
        )}

        {/* Response */}
        {state.response && (
          <div
            style={{
              marginTop: 12,
              background: "#FAFAFA",
              borderRadius: 10,
              padding: "14px 16px",
              border: "1px solid #F0F0F3",
            }}
          >
            {/* Badges */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <ConfidenceBadge confidence={state.response.confidence} />
              {state.response.status !== "OK" && (
                <StatusBadge status={state.response.status} />
              )}
            </div>

            {/* Answer */}
            <p
              style={{
                fontSize: 13,
                color: state.response.status === "INSUFFICIENT_EVIDENCE" ? "#6B7280" : "#1D1D1F",
                lineHeight: 1.65,
                margin: 0,
                fontStyle: state.response.status === "INSUFFICIENT_EVIDENCE" ? "italic" : "normal",
              }}
            >
              {state.response.answer}
            </p>

            {/* Evidence citations */}
            {state.response.evidence.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                {state.response.evidence.map((ev, i) => (
                  <blockquote
                    key={i}
                    style={{
                      margin: 0,
                      padding: "8px 12px 8px 14px",
                      background: "#F2F2F4",
                      borderRadius: 6,
                      borderLeft: "2px solid #C7C7CC",
                      fontSize: 12,
                      color: "#3C3C43",
                      fontStyle: "italic",
                      lineHeight: 1.55,
                    }}
                  >
                    &ldquo;{ev.text}&rdquo;
                    {(ev.section || ev.page > 0) && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          color: "#9CA3AF",
                          fontStyle: "normal",
                          marginTop: 3,
                        }}
                      >
                        {ev.section}
                        {ev.page > 0 ? ` · Page ~${ev.page}` : ""}
                      </span>
                    )}
                  </blockquote>
                ))}
              </div>
            )}

            {/* Clear */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "#9CA3AF",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Circular Card ──────────────────────────────────────────────────────────

function CircularCard({
  circular,
  isExpanded,
  isReviewed,
  chatState,
  onToggleExpand,
  onToggleReviewed,
  onChatAsk,
  onChatClear,
}: {
  circular: Circular;
  isExpanded: boolean;
  isReviewed: boolean;
  chatState: ChatState | undefined;
  onToggleExpand: () => void;
  onToggleReviewed: (e: React.MouseEvent) => void;
  onChatAsk: (question: string) => void;
  onChatClear: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const actionItems = parseList(circular.action_items);
  const evidence = parseList(circular.evidence);
  const isProcessed = !!circular.summary;
  const canChat = hasDocContent(circular);

  return (
    <article
      style={{
        background: "#FFFFFF",
        border: `1px solid ${isExpanded ? "#D2D2D7" : "#E5E5EA"}`,
        borderRadius: 14,
        overflow: "hidden",
        opacity: isReviewed && !isExpanded ? 0.55 : 1,
        transition: "opacity 250ms ease, box-shadow 200ms ease, border-color 200ms ease",
        boxShadow: hovered && !isReviewed ? "0 2px 12px rgba(0,0,0,0.07)" : isExpanded ? "0 4px 20px rgba(0,0,0,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row — clickable to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => e.key === "Enter" && onToggleExpand()}
        aria-expanded={isExpanded}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 13,
          padding: "17px 20px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <RelevanceDot relevance={circular.relevance} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 500,
              color: "#1D1D1F",
              lineHeight: 1.45,
              letterSpacing: "-0.01em",
            }}
          >
            {circular.title}
          </p>
          {circular.why_it_matters ? (
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 13,
                color: "#6E6E73",
                lineHeight: 1.5,
                overflow: isExpanded ? "visible" : "hidden",
                display: "-webkit-box",
                WebkitLineClamp: isExpanded ? "unset" : 2,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties}
            >
              {circular.why_it_matters}
            </p>
          ) : !isProcessed ? (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#C0BFC4", fontStyle: "italic" }}>
              Not yet analyzed — click &ldquo;Process AI&rdquo; to analyze
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
            flexShrink: 0,
            paddingTop: 1,
          }}
        >
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {circular.is_pdf === 1 && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "#FEF3C7",
                  color: "#92400E",
                  letterSpacing: "0.05em",
                }}
              >
                PDF
              </span>
            )}
            <SourceTag source={circular.source} />
          </div>
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            {formatDate(circular.date || circular.created_at)}
          </span>

          {/* Expand chevron */}
          <span
            aria-hidden="true"
            style={{ fontSize: 10, color: "#C0BFC4", transition: "transform 200ms ease", display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▾
          </span>
        </div>
      </div>

      {/* Mark reviewed — sits just below header, full-width, always visible */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "0 20px 12px",
          marginTop: -4,
        }}
      >
        <button
          onClick={onToggleReviewed}
          style={{
            fontSize: 11,
            color: isReviewed ? "#34C759" : "#C0BFC4",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontWeight: isReviewed ? 600 : 400,
            transition: "color 200ms ease",
          }}
        >
          {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
        </button>
      </div>

      {/* Expanded body */}
      <div
        className="card-expand"
        style={{ maxHeight: isExpanded ? 5000 : 0 }}
      >
        <div
          style={{
            borderTop: "1px solid #F0F0F3",
            padding: "20px 20px 22px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          {/* Relevance badge */}
          {circular.relevance && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  background: RELEVANCE_DOT[circular.relevance] + "18",
                  color: RELEVANCE_DOT[circular.relevance] ?? "#6B7280",
                  letterSpacing: "0.04em",
                }}
              >
                {circular.relevance} RELEVANCE
              </span>
            </div>
          )}

          {/* Summary */}
          {circular.summary && (
            <section>
              <SectionLabel>Summary</SectionLabel>
              <p style={{ margin: 0, fontSize: 14, color: "#1D1D1F", lineHeight: 1.65 }}>
                {circular.summary}
              </p>
            </section>
          )}

          {/* Action items */}
          {actionItems.length > 0 && (
            <section>
              <SectionLabel>Action Items for Glomopay</SectionLabel>
              <ul
                style={{
                  margin: 0,
                  padding: "0 0 0 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {actionItems.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#1D1D1F", lineHeight: 1.6 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Evidence */}
          {evidence.length > 0 && (
            <section>
              <SectionLabel>Evidence from Document</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {evidence.map((line, i) => (
                  <blockquote
                    key={i}
                    style={{
                      margin: 0,
                      padding: "10px 14px 10px 16px",
                      background: "#F7F7F8",
                      borderRadius: 8,
                      borderLeft: "2.5px solid #D2D2D7",
                      fontSize: 13,
                      color: "#3C3C43",
                      fontStyle: "italic",
                      lineHeight: 1.65,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {line}
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          {/* Not processed yet */}
          {!isProcessed && (
            <p style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>
              Click &ldquo;Process AI&rdquo; above to generate the summary, relevance score, and action items for this circular.
            </p>
          )}

          {/* View original */}
          {circular.link && (
            <a
              href={circular.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "#007AFF",
                textDecoration: "none",
                width: "fit-content",
              }}
            >
              View original source →
            </a>
          )}

          {/* Document chat */}
          {canChat && (
            <DocumentChat
              circularId={circular.id}
              chatState={chatState}
              onAsk={onChatAsk}
              onClear={onChatClear}
            />
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#EBEBF0",
        borderRadius: 9,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "5px 13px",
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              color: active ? "#1D1D1F" : "#6E6E73",
              background: active ? "#FFFFFF" : "transparent",
              border: active ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent",
              borderRadius: 7,
              cursor: "pointer",
              transition: "background 150ms ease, color 150ms ease",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {opt.label}
            {opt.count !== undefined && opt.count > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: active ? "#1D1D1F" : "#C7C7CC",
                  color: "#FFFFFF",
                  borderRadius: 8,
                  padding: "0 5px",
                  minWidth: 16,
                  textAlign: "center",
                  lineHeight: "15px",
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Top button ─────────────────────────────────────────────────────────────

function TopButton({
  label,
  loadingLabel,
  loading,
  primary,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  loading: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = primary
    ? loading ? "#888" : hovered ? "#333" : "#1D1D1F"
    : loading ? "#F5F5F7" : hovered ? "#EBEBF0" : "#FFFFFF";

  const color = primary ? "#FFFFFF" : loading ? "#9CA3AF" : "#1D1D1F";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 18px",
        fontSize: 13,
        fontWeight: 500,
        color,
        background: bg,
        border: primary ? "none" : "1px solid #D2D2D7",
        borderRadius: 9,
        cursor: loading ? "default" : "pointer",
        transition: "background 180ms ease, color 180ms ease",
        letterSpacing: "-0.01em",
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const [relevanceFilter, setRelevanceFilter] = useState<RelevanceFilter>("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // reviewed is initialized from DB on load, then kept in sync via API
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [chatStates, setChatStates] = useState<Record<string, ChatState>>({});

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/circulars");
      const data = await res.json();
      if (data.success) {
        setCirculars(data.data);
        // Hydrate reviewed state from DB
        const reviewedIds = new Set<string>(
          (data.data as Circular[])
            .filter((c) => c.reviewed === 1)
            .map((c) => c.id)
        );
        setReviewed(reviewedIds);
      }
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleFetch = async () => {
    setFetching(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/fetch", { method: "POST" });
      const data = await res.json();
      setStatusMsg(
        data.inserted === 0
          ? "Already up to date"
          : `${data.inserted} new ${data.inserted === 1 ? "circular" : "circulars"} added`
      );
      if (Array.isArray(data.sources)) setSourceHealth(data.sources);
      setLastFetched(new Date());
      await load();
    } catch {
      setStatusMsg("Fetch failed — check connection");
    } finally {
      setFetching(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setStatusMsg("");
    let totalProcessed = 0;
    let totalErrors = 0;

    try {
      // Auto-loop: keep processing until nothing left (max 8 batches = 40 circulars)
      for (let batch = 0; batch < 8; batch++) {
        const res = await fetch("/api/process", { method: "POST" });
        const data = await res.json();
        totalProcessed += data.processed ?? 0;
        totalErrors += data.errors ?? 0;

        if ((data.processed ?? 0) === 0) break; // nothing left to process
      }

      if (totalErrors > 0) {
        setStatusMsg(`${totalProcessed} analyzed, ${totalErrors} failed`);
      } else {
        setStatusMsg(
          totalProcessed === 0
            ? "All circulars already analyzed"
            : `${totalProcessed} ${totalProcessed === 1 ? "circular" : "circulars"} analyzed`
        );
      }
      await load();
    } catch {
      setStatusMsg("Processing failed — check API keys");
    } finally {
      setProcessing(false);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const handleChatAsk = async (circularId: string, question: string) => {
    setChatStates((prev) => ({
      ...prev,
      [circularId]: { response: null, loading: true, error: null },
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circularId, question }),
      });
      const data = await res.json();

      if (!data.success) {
        setChatStates((prev) => ({
          ...prev,
          [circularId]: { response: null, loading: false, error: data.error || "Request failed" },
        }));
        return;
      }

      setChatStates((prev) => ({
        ...prev,
        [circularId]: {
          response: {
            answer: data.answer,
            evidence: data.evidence,
            confidence: data.confidence,
            status: data.status,
          },
          loading: false,
          error: null,
        },
      }));
    } catch {
      setChatStates((prev) => ({
        ...prev,
        [circularId]: { response: null, loading: false, error: "Network error — try again" },
      }));
    }
  };

  const handleChatClear = (circularId: string) => {
    setChatStates((prev) => {
      const next = { ...prev };
      delete next[circularId];
      return next;
    });
  };

  // ── Toggles ───────────────────────────────────────────────────────────────

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  const toggleReviewed = async (id: string) => {
    const wasReviewed = reviewed.has(id);
    const nowReviewed = !wasReviewed;

    // Optimistic update
    setReviewed((prev) => {
      const s = new Set(prev);
      nowReviewed ? s.add(id) : s.delete(id);
      return s;
    });

    // Persist to DB
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reviewed: nowReviewed }),
      });
      if (!res.ok) throw new Error("API error");
    } catch {
      // Rollback on failure
      setReviewed((prev) => {
        const s = new Set(prev);
        wasReviewed ? s.add(id) : s.delete(id);
        return s;
      });
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const highCount = circulars.filter((c) => c.relevance === "HIGH").length;
  const mediumCount = circulars.filter((c) => c.relevance === "MEDIUM").length;
  const lowCount = circulars.filter((c) => c.relevance === "LOW").length;
  const notRelevantCount = circulars.filter((c) => c.relevance === "NOT RELEVANT").length;
  const analyzed = circulars.filter((c) => !!c.summary).length;
  const unanalyzed = circulars.length - analyzed;
  const unreviewedCount = circulars.length - reviewed.size;

  const filtered = circulars.filter((c) => {
    if (relevanceFilter !== "ALL" && c.relevance !== relevanceFilter) return false;
    if (reviewFilter === "reviewed" && !reviewed.has(c.id)) return false;
    if (reviewFilter === "unreviewed" && reviewed.has(c.id)) return false;
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F7" }}>
      {/* Sticky header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(245,245,247,0.92)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "0 28px",
            minHeight: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#1D1D1F", letterSpacing: "-0.02em" }}>
              Regulatory Intel
            </h1>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>Glomopay</span>
            {lastFetched && (
              <span style={{ fontSize: 11, color: "#C0BFC4" }}>
                · Updated {formatTimeAgo(lastFetched)}
              </span>
            )}
          </div>

          {statusMsg && (
            <p
              style={{
                fontSize: 12,
                color: statusMsg.includes("fail") || statusMsg.includes("error")
                  ? "#D94F43"
                  : "#6E6E73",
                flex: 1,
                textAlign: "center",
                margin: 0,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {statusMsg}
            </p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <TopButton
              label="Fetch Updates"
              loadingLabel="Fetching…"
              loading={fetching}
              onClick={handleFetch}
            />
            <TopButton
              label="Process AI"
              loadingLabel={`Analyzing…`}
              loading={processing}
              primary
              onClick={handleProcess}
            />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 28px 60px" }}>
        {/* Stats strip */}
        {circulars.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 0,
              marginBottom: 22,
              background: "#FFFFFF",
              border: "1px solid #E5E5EA",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Total", value: circulars.length, color: "#1D1D1F" },
              { label: "High priority", value: highCount, color: "#D94F43" },
              { label: "Analyzed", value: analyzed, color: "#1D1D1F" },
              ...(unanalyzed > 0 ? [{ label: "Pending AI", value: unanalyzed, color: "#C4821A" }] : []),
              { label: "Unreviewed", value: unreviewedCount, color: "#1D1D1F" },
            ].map(({ label, value, color }, i, arr) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: "14px 20px",
                  borderRight: i < arr.length - 1 ? "1px solid #F0F0F3" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 500, color, letterSpacing: "-0.03em" }}>
                  {value}
                </span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Source health bar — shown after first fetch */}
        {sourceHealth.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
              padding: "8px 14px",
              background: "#FFFFFF",
              border: "1px solid #E5E5EA",
              borderRadius: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 2 }}>
              Sources
            </span>
            {sourceHealth.map((s) => {
              const ok = s.status === "ok" || s.status === "empty";
              const blocked = s.status === "blocked";
              const errored = s.status === "error";
              return (
                <span
                  key={s.source}
                  title={s.error ?? (s.status === "empty" ? "No new items" : `${s.count} fetched`)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: ok ? "#F0FDF4" : blocked ? "#FFFBEB" : "#FEF2F2",
                    color: ok ? "#166534" : blocked ? "#92400E" : "#991B1B",
                    border: `1px solid ${ok ? "#BBF7D0" : blocked ? "#FDE68A" : "#FECACA"}`,
                  }}
                >
                  <span>{ok ? "✓" : blocked ? "⚠" : "✕"}</span>
                  <span>{s.source}</span>
                  {s.status === "blocked" && <span style={{ opacity: 0.7 }}>WAF</span>}
                  {errored && <span style={{ opacity: 0.7 }}>err</span>}
                </span>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SegmentedControl<RelevanceFilter>
              value={relevanceFilter}
              onChange={setRelevanceFilter}
              options={[
                { value: "ALL", label: "All" },
                { value: "HIGH", label: "High", count: highCount },
                { value: "MEDIUM", label: "Medium", count: mediumCount },
                { value: "LOW", label: "Low", count: lowCount },
                ...(notRelevantCount > 0
                  ? [{ value: "NOT RELEVANT" as RelevanceFilter, label: "N/R", count: notRelevantCount }]
                  : []),
              ]}
            />
            <SegmentedControl<ReviewFilter>
              value={reviewFilter}
              onChange={setReviewFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unreviewed", label: "Unreviewed", count: unreviewedCount },
                { value: "reviewed", label: "Reviewed", count: reviewed.size },
              ]}
            />
          </div>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Card list */}
        {initialLoad ? (
          <div style={{ textAlign: "center", padding: "100px 0", color: "#9CA3AF", fontSize: 13 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9CA3AF" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1.5px solid #D2D2D7",
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                color: "#D2D2D7",
              }}
            >
              ○
            </div>
            <p style={{ fontSize: 14, color: "#6E6E73", marginBottom: 6 }}>
              {circulars.length === 0 ? "No updates yet" : "No matches for current filters"}
            </p>
            <p style={{ fontSize: 13, color: "#9CA3AF" }}>
              {circulars.length === 0
                ? 'Click "Fetch Updates" to pull the latest circulars.'
                : "Try adjusting the filters above."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((c) => (
              <CircularCard
                key={c.id}
                circular={c}
                isExpanded={expanded.has(c.id)}
                isReviewed={reviewed.has(c.id)}
                chatState={chatStates[c.id]}
                onToggleExpand={() => toggleExpand(c.id)}
                onToggleReviewed={(e) => {
                  e.stopPropagation();
                  toggleReviewed(c.id);
                }}
                onChatAsk={(q) => handleChatAsk(c.id, q)}
                onChatClear={() => handleChatClear(c.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
