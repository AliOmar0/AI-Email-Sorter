import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmailBodyProps {
  html: string;
  text: string;
  // True when the sanitized HTML has remote images held back in data-blocked-src.
  hasRemoteImages?: boolean;
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

// Restore the held-back remote images: the server moved every remote src into a
// data-blocked-src attribute so nothing loads by default. When the user opts in
// we swap it back to a real src. Operating on the controlled attribute name (not
// arbitrary parsing) keeps this safe — the HTML was already sanitized server-side.
function revealRemoteImages(html: string): string {
  return html.replace(/data-blocked-src=/gi, "src=");
}

/**
 * Renders an email body inside a sandboxed iframe so the sender's HTML and
 * styles are fully isolated from the app's own UI. The frame auto-sizes to its
 * content. Falls back to plain text when no HTML body is available.
 *
 * Remote images are blocked by default (tracking-pixel / privacy protection)
 * and only loaded after the user clicks "Display images".
 */
export function EmailBody({ html, text, hasRemoteImages = false }: EmailBodyProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const [showImages, setShowImages] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Reset the image-display opt-in whenever a different email is shown.
  useEffect(() => {
    setShowImages(false);
  }, [html]);

  const renderedHtml = showImages ? revealRemoteImages(html) : html;

  const srcDoc = html
    ? `<!doctype html><html><head><meta charset="utf-8">${frameStyles(isDark)}</head><body>${renderedHtml}</body></html>`
    : null;

  useEffect(() => {
    if (!srcDoc) return;
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | null = null;
    let rafId = 0;
    let cancelled = false;

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

    const wireUp = (doc: Document) => {
      measure();

      // Keep resizing as fonts/images/layout settle.
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

    // Size the frame as soon as the (same-origin, script-less) srcDoc has
    // parsed, rather than waiting for the iframe `load` event. `load` only
    // fires once every remote image has finished downloading, which can leave
    // the frame stuck at its initial height — showing an inner scrollbar — for
    // a long time on image-heavy emails. Polling for the parsed body via rAF
    // lets us measure within a frame or two.
    const waitForBody = () => {
      if (cancelled) return;
      const doc = frame.contentDocument;
      if (doc && doc.body) {
        wireUp(doc);
        return;
      }
      rafId = requestAnimationFrame(waitForBody);
    };
    waitForBody();

    // A final re-measure once everything (incl. images) has fully loaded.
    const onLoad = () => measure();
    frame.addEventListener("load", onLoad);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
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
      {hasRemoteImages && !showImages && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <ImageOff className="w-3.5 h-3.5 shrink-0" />
            Remote images are blocked to protect your privacy.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs shrink-0"
            onClick={() => setShowImages(true)}
          >
            Display images
          </Button>
        </div>
      )}
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
