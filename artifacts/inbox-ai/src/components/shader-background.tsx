import { Component, Suspense, lazy, type ReactNode } from "react";

// The `shaders` package (shaders.com) is a WebGPU-based, three.js-backed effects
// library. It's heavy and only renders on WebGPU-capable browsers, so we:
//   - lazy-load it into its own chunk (keeps the initial bundle small), and
//   - wrap it in an error boundary so any failure (unsupported GPU, load error)
//     silently falls back to the page's normal CSS background.
//
// We compose the effect locally with the <Shader> root + an effect node rather
// than the hosted <Preview> token. The token path renders a "Preview" watermark
// and fetches the preset from shaders.com at runtime; composing locally avoids
// both, and lets us turn off the library's default-on telemetry.
//
// Swap <MeshGradient /> for any effect from "shaders/react" — e.g. Aurora,
// FlowingGradient, Plasma, StudioBackground — to change the look.
const LazyShader = lazy(async () => {
  const { Shader, MeshGradient } = await import("shaders/react");
  return {
    default: () => (
      <Shader
        disableTelemetry
        style={{ width: "100%", height: "100%" }}
      >
        <MeshGradient />
      </Shader>
    ),
  };
});

class ShaderErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

interface ShaderBackgroundProps {
  /** Extra classes for the absolutely-positioned wrapper. */
  className?: string;
}

/**
 * Full-bleed animated shader, intended to sit behind page content as a
 * decorative background. Renders nothing if the GPU/library isn't available.
 */
export function ShaderBackground({ className = "" }: ShaderBackgroundProps) {
  // Respect the OS "reduce motion" preference: a constantly animating GPU
  // background is exactly the kind of motion WCAG 2.3.3 asks us to drop, and a
  // CSS media query can't pause a WebGPU canvas — so we skip rendering it.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    >
      <ShaderErrorBoundary>
        <Suspense fallback={null}>
          <LazyShader />
        </Suspense>
      </ShaderErrorBoundary>
    </div>
  );
}
