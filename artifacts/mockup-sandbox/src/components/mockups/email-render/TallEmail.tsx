import { useEffect, useRef, useState } from "react";

const FRAME_STYLES = `
  <style>
    :root { color-scheme: light dark; }
    html, body {
      margin: 0; padding: 0; background: transparent; color: inherit;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px; line-height: 1.6; word-break: break-word; overflow-wrap: anywhere;
    }
    @media (prefers-color-scheme: light) { body { color: #1f2937; } a { color: #4f46e5; } }
    img { max-width: 100% !important; height: auto !important; border-radius: 8px; }
    table { max-width: 100% !important; }
    * { max-width: 100%; box-sizing: border-box; }
  </style>
`;

function EmailBody({ html, text }: { html: string; text: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8">${FRAME_STYLES}</head><body>${html}</body></html>`
    : null;

  useEffect(() => {
    if (!srcDoc) return;
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      const next = Math.min(
        8000,
        Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight),
      );
      if (next > 0) setHeight(next + 24);
    };

    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => measure());
        observer.observe(doc.body);
        observer.observe(doc.documentElement);
      }
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", measure, { once: true });
          img.addEventListener("error", measure, { once: true });
        }
      });
    };

    frame.addEventListener("load", onLoad);
    measure();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  if (!srcDoc) {
    return (
      <div className="text-foreground/80 whitespace-pre-wrap leading-relaxed text-[15px] font-sans">
        {text || "No content."}
      </div>
    );
  }

  return (
    <div className="w-full bg-background rounded-lg">
      <iframe
        ref={frameRef}
        title="Email content"
        sandbox="allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
        className="w-full border-0 bg-transparent block"
      />
    </div>
  );
}

const paragraph =
  "Thank you for your continued partnership this quarter. We wanted to share a detailed summary of everything that shipped, what we learned, and where we are headed next. This message intentionally runs long so we can confirm the reading pane expands to fit the full content without any blank gap.";

const LONG_HTML = `
  <h1 style="font-size:22px;margin:0 0 12px">Quarterly Product Update</h1>
  <p>${paragraph}</p>
  <h2 style="font-size:18px;margin:20px 0 8px">What shipped</h2>
  <ul>
    ${Array.from({ length: 10 }, (_, i) => `<li>Feature item number ${i + 1}: ${paragraph}</li>`).join("")}
  </ul>
  <h2 style="font-size:18px;margin:20px 0 8px">Details</h2>
  ${Array.from({ length: 8 }, () => `<p>${paragraph}</p>`).join("")}
  <blockquote>${paragraph}</blockquote>
  <p style="margin-top:24px">Best regards,<br/>The Product Team</p>
`;

export function TallEmail() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[640px] rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 border-b border-border pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reading pane — auto-height check
          </p>
        </div>
        <EmailBody html={LONG_HTML} text="" />
      </div>
    </div>
  );
}
