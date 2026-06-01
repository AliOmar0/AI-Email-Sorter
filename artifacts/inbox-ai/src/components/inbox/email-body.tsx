import { useEffect, useRef, useState } from "react";

interface EmailBodyProps {
  html: string;
  text: string;
}

const FRAME_STYLES = `
  <style>
    :root { color-scheme: light dark; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    @media (prefers-color-scheme: dark) {
      body { color: #f3f4f6; }
      a { color: #818cf8; }
    }
    @media (prefers-color-scheme: light) {
      body { color: #1f2937; }
      a { color: #4f46e5; }
    }
    img { max-width: 100% !important; height: auto !important; border-radius: 8px; }
    table { max-width: 100% !important; }
    * { max-width: 100%; box-sizing: border-box; }
    
    /* Clean up default blockquotes often found in emails */
    blockquote {
      border-left: 3px solid #cbd5e1;
      margin-left: 0;
      padding-left: 1rem;
      color: #64748b;
    }
    @media (prefers-color-scheme: dark) {
      blockquote { border-left-color: #475569; color: #94a3b8; }
    }
  </style>
`;

/**
 * Renders an email body inside a sandboxed iframe so the sender's HTML and
 * styles are fully isolated from the app's own UI. The frame auto-sizes to its
 * content. Falls back to plain text when no HTML body is available.
 */
export function EmailBody({ html, text }: EmailBodyProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8">${FRAME_STYLES}</head><body>${html}</body></html>`
    : null;

  useEffect(() => {
    if (!srcDoc) return;
    const frame = frameRef.current;
    if (!frame) return;

    const resize = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const next = Math.min(
        6000,
        Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight),
      );
      setHeight(next + 16); // padding
    };

    frame.addEventListener("load", resize);
    const timer = window.setInterval(resize, 400);
    const stop = window.setTimeout(() => window.clearInterval(timer), 3000);
    return () => {
      frame.removeEventListener("load", resize);
      window.clearInterval(timer);
      window.clearTimeout(stop);
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
        sandbox="allow-popups"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
        className="w-full border-0 bg-transparent block"
      />
    </div>
  );
}
