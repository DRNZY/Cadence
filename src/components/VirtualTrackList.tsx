import React, { useState, useEffect } from "react";

interface VirtualTrackListProps<T> {
  items: T[];
  rowHeight?: number;
  overscan?: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualTrackList<T>({
  items,
  rowHeight = 56,
  overscan = 8,
  scrollRef,
  renderItem
}: VirtualTrackListProps<T>) {
  const [measure, setMeasure] = useState({ scrollTop: 0, viewport: 600 });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let rafId = 0;
    const readViewport = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const viewport = scroller.clientHeight || 600;
        const scrollTop = scroller.scrollTop;
        setMeasure(prev =>
          prev.scrollTop === scrollTop && Math.abs(prev.viewport - viewport) < 2
            ? prev
            : { scrollTop, viewport }
        );
      });
    };

    readViewport();
    scroller.addEventListener("scroll", readViewport, { passive: true });
    const ro = new ResizeObserver(readViewport);
    ro.observe(scroller);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      scroller.removeEventListener("scroll", readViewport);
      ro.disconnect();
    };
  }, [scrollRef]);

  const total = items.length;
  if (total === 0) return null;

  const { scrollTop, viewport } = measure;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(total, startIndex + Math.ceil(viewport / rowHeight) + overscan * 2);
  const slice = items.slice(startIndex, endIndex);

  return (
    <div className="relative">
      <div aria-hidden="true" style={{ height: startIndex * rowHeight }} />
      {slice.map((item, i) => renderItem(item, startIndex + i))}
      <div aria-hidden="true" style={{ height: Math.max(0, (total - endIndex) * rowHeight) }} />
    </div>
  );
}