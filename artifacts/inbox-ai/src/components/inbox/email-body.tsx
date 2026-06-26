import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

interface EmailBodyProps {
  html: string;
  text: string;
}

// Styles for the dark/light variants of the sandboxed email frame. We can't
// rely on `prefers-color-scheme` because the app toggles its theme via a
// `.dark` class (next-themes, `enableSystem={false}`), which the iframe's
// isolated document can't see. So the active theme is injected explicitly.
function frameStyles(isDark: boolean): string {
  const bodyColor = isDark ? "#f3f4f6" : "#1f2937";
  const linkColor = isDark ? "#818cf8" : "#4f46e5";
  const quoteBorder = isDark ? "#475569" : "#cbd5e1";
  const quoteColor = isDark ? "#94a3b8" : "#64748b";
  return `
  <style>
    :root { color-scheme: ${isDark ? "dark" : "light"}; }
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: ${bodyColor};
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      overflow-wrap: break-word;
    }
    a { color: ${linkColor}; }
    img { max-width: 100% !important; height: auto !important; border-radius: 8px; }
    table { max-width: 100% !important; }
    * { max-width: 100%; box-sizing: border-box; }

    /* Clean up default blockquotes often found in emails */
    blockquote {
      border-left: 3px solid ${quoteBorder};
      margin-left: 0;
      padding-left: 1rem;
      color: ${quoteColor};
    }
  </style>
`;
}

/**
 * Renders an email body inside a sandboxed iframe so the sender's HTML and
 * styles are fully isolated from the app's own UI. The frame auto-sizes to its
 * content. Falls back to plain text when no HTML body is available.
 */
export function EmailBody({ html, text }: EmailBodyProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8">${frameStyles(isDark)}</head><body>${html}</body></html>`
    : null;

  useEffect(() => {
    if (!srcDoc) return;
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | null = null;

    // Measure the iframe's content height. This requires `allow-same-origin`
    // on the sandbox (scripts stay disabled), otherwise contentDocument is null.
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      const next = Math.min(
        8000,
        Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight),
      );
      if (next > 0) setHeight(next + 24); // breathing room
    };

    const onLoad = () => {
      measure();
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;

      // Keep resizing as fonts/images/layout settle, permanently (not just 3s).
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => measure());
        observer.observe(doc.body);
        observer.observe(doc.documentElement);
      }

      // Images often load after the document, changing total height.
      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", measure, { once: true });
          img.addEventListener("error", measure, { once: true });
        }
      });
    };

    frame.addEventListener("load", onLoad);
    // srcDoc can be ready synchronously; attempt an immediate measure too.
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
