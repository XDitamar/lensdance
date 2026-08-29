// src/components/ErrorBoundary.jsx
//
// A React component that throws during render takes the whole tree down with
// it, and what the visitor sees is a blank white page — no message, nothing in
// the interface to report. That is the worst possible failure to debug: it
// looks identical whether the cause is a missing field, an unsupported browser
// API, or a network hiccup, and it usually only happens on somebody else's
// machine.
//
// This catches the throw, keeps the rest of the page alive, and shows the
// actual error text with a button to copy it. A blank screen becomes a
// sentence somebody can send in a WhatsApp message.
//
// It deliberately does NOT try to recover or retry: if a render threw once it
// will almost certainly throw again, and a reload loop is worse than an honest
// stop. Reloading is offered as a button the person chooses to press.

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the component stack too — it names the component that threw, which
    // is usually more useful than the message alone.
    this.setState({ info });
    console.error("[LensDance] Render error:", error, info?.componentStack);
  }

  report() {
    const { error, info } = this.state;
    return [
      `Error: ${error?.message || error}`,
      `Page: ${window.location.pathname}${window.location.search}`,
      `Browser: ${navigator.userAgent}`,
      info?.componentStack ? `Component stack:${info.componentStack}` : "",
      error?.stack ? `Stack:\n${error.stack}` : "",
    ].filter(Boolean).join("\n\n");
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={s.wrap} dir="auto">
        <div style={s.card}>
          <div style={s.mark} aria-hidden="true">✦</div>
          <h1 style={s.title}>Something went wrong on this page</h1>
          <p style={s.body}>
            The rest of the site still works. If you can, copy the details below
            and send them over — they say exactly what broke.
          </p>

          <pre style={s.pre}>{this.report()}</pre>

          <div style={s.row}>
            <button
              type="button"
              style={s.btn}
              onClick={() => {
                // navigator.clipboard needs a secure context and can be absent;
                // selecting the text is the fallback that always works.
                const text = this.report();
                navigator.clipboard?.writeText(text)
                  .then(() => this.setState({ copied: true }))
                  .catch(() => {
                    const el = document.querySelector("#ld-error-report");
                    if (el) {
                      const r = document.createRange();
                      r.selectNodeContents(el);
                      const sel = window.getSelection();
                      sel.removeAllRanges();
                      sel.addRange(r);
                    }
                  });
              }}
            >
              {this.state.copied ? "Copied ✓" : "Copy details"}
            </button>
            <button type="button" style={s.ghost} onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/" style={s.ghost}>Home</a>
          </div>
        </div>
      </div>
    );
  }
}

const s = {
  wrap:  { background: "#F5F1EA", minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" },
  card:  { background: "#FDFAF5", border: "1px solid #E2D9CE", padding: "32px 30px", maxWidth: 620, width: "100%", textAlign: "center" },
  mark:  { fontSize: 26, color: "#B2967D", marginBottom: 12 },
  title: { fontFamily: "Georgia, serif", fontSize: 21, fontWeight: 400, color: "#2C1E12", margin: "0 0 12px" },
  body:  { fontFamily: "Arial, sans-serif", fontSize: 12.5, lineHeight: 1.8, color: "#8A7868", margin: "0 0 20px" },
  pre:   { textAlign: "left", direction: "ltr", background: "#F5F1EA", border: "1px solid #E2D9CE", padding: "12px 14px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: "#4A3525", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto", margin: "0 0 20px" },
  row:   { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  btn:   { background: "#4A3525", color: "#F5F1EA", border: "none", padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer", minHeight: 42 },
  ghost: { background: "transparent", color: "#4A3525", border: "1px solid #B2967D", padding: "12px 24px", fontFamily: "Arial, sans-serif", fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer", textDecoration: "none", display: "inline-block", minHeight: 42, boxSizing: "border-box" },
};
