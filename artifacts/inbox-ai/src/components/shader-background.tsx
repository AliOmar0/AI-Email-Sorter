import { Component, Suspense, lazy, type ReactNode } from "react";

// The `shaders` package (shaders.com) is a WebGPU-based, three.js-backed effects
// library. It's heavy and only renders on WebGPU-capable browsers, so we:
//   - lazy-load it into its own chunk (keeps the initial bundle small), and
//   - wrap it in an error boundary so any failure (unsupported GPU, network,
//     load error) silently falls back to the page's normal CSS background.
// `Preview` renders a hosted preset from shaders.com referenced by its UUID.
const Preview = lazy(() =>
  import("shaders/react").then((m) => ({ default: m.Preview })),
);

// Default preset. Swap this UUID for any shader from your shaders.com library.
const DEFAULT_SHADER = "24e2e2f4-185c-4eaf-aa44-b868bfc18bb6";

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
  /** shaders.com preset UUID to render. */
  shader?: string;
  /** Extra classes for the absolutely-positioned wrapper. */
  className?: string;
}

/**
 * Full-bleed animated shader, intended to sit behind page content as a
 * decorative background. Renders nothing if the GPU/library isn't available.
 */
export function ShaderBackground({
  shader = DEFAULT_SHADER,
  className = "",
}: ShaderBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    >
      <ShaderErrorBoundary>
        <Suspense fallback={null}>
          <Preview
            shader={shader}
            style={{ width: "100%", height: "100%" }}
          />
        </Suspense>
      </ShaderErrorBoundary>
    </div>
  );
}
