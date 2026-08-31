import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const region = (r: "drag" | "no-drag"): CSSProperties =>
  ({ WebkitAppRegion: r }) as CSSProperties;

function Glyph({ kind, maximized }: { kind: "close" | "minimize" | "toggle-maximize"; maximized: boolean }) {
  const stroke = {
    stroke: "rgba(0,0,0,0.62)",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <svg viewBox="0 0 8 8" className="size-2" aria-hidden>
      {kind === "close" && <path d="M2.3 2.3 L5.7 5.7 M5.7 2.3 L2.3 5.7" {...stroke} />}
      {kind === "minimize" && <path d="M1.8 4 H6.2" {...stroke} />}
      {kind === "toggle-maximize" &&
        (maximized ? (
          <>
            <path d="M1.6 4.4 V6.4 H3.6 Z" {...stroke} />
            <path d="M6.4 3.6 V1.6 H4.4 Z" {...stroke} />
          </>
        ) : (
          <rect x="1.8" y="1.8" width="4.4" height="4.4" rx="1" {...stroke} />
        ))}
    </svg>
  );
}

function TrafficLight({
  color,
  action,
  maximized,
}: {
  color: string;
  action: "close" | "minimize" | "toggle-maximize";
  maximized: boolean;
}) {
  return (
    <button
      onClick={() => window.cadence.windowControl(action)}
      aria-label={action.replace("toggle-maximize", "maximize")}
      style={{ backgroundColor: color, ...region("no-drag") }}
      className="grid size-3 cursor-pointer place-items-center rounded-full ring-1 ring-black/25 transition-[filter] duration-100 hover:brightness-90 active:brightness-75"
    >
      <span className="opacity-0 transition-opacity duration-100 group-hover/lights:opacity-100">
        <Glyph kind={action} maximized={maximized} />
      </span>
    </button>
  );
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let live = true;
    void window.cadence.isMaximized().then((m) => {
      if (live) setMaximized(m);
    });
    const unsub = window.cadence.onWindowStateChanged(setMaximized);
    return () => {
      live = false;
      unsub();
    };
  }, []);

  return (
    <header
      className="relative z-20 flex h-12 shrink-0 select-none items-center px-4"
      style={region("drag")}
    >
      <div className="group/lights flex items-center gap-2">
        <TrafficLight color="#ff5f57" action="close" maximized={maximized} />
        <TrafficLight color="#febc2e" action="minimize" maximized={maximized} />
        <TrafficLight color="#28c840" action="toggle-maximize" maximized={maximized} />
      </div>
      <span className="ml-5 text-sm font-semibold tracking-tight opacity-70">Cadence</span>
    </header>
  );
}
