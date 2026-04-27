/**
 * Virtual Scrolling Utility for React Lists
 * 
 * Optimizes rendering of long lists by only rendering visible items.
 * Designed to work with dnd-kit drag-and-drop when enabled.
 * 
 * Usage:
 *   const { virtualItems, totalHeight, scrollToIndex } = useVirtualScroll({
 *     itemCount: sessions.length,
 *     getItemSize: (index) => isCompact ? 40 : 52,
 *     containerHeight: 500,
 *     overscan: 5,
 *   });
 */

import { useRef, useState, useEffect, useCallback, useMemo, type RefObject } from "react";

export interface VirtualItem {
  index: number;
  offsetTop: number;
  size: number;
}

interface UseVirtualScrollOptions {
  /** Total number of items */
  itemCount: number;
  /** Function that returns the height of item at given index */
  getSize: (index: number) => number;
  /** Container height in pixels */
  containerHeight: number;
  /** Number of extra items to render above/below visible area */
  overscan?: number;
  /** Scroll container ref */
  scrollContainerRef?: RefObject<HTMLDivElement>;
  /** Estimated default item size (used before actual measurement) */
  estimatedItemSize?: number;
  /** Scroll position key - change this to reset scroll position */
  scrollResetKey?: unknown;
}

interface UseVirtualScrollReturn {
  /** Items currently visible (+ overscan) */
  virtualItems: VirtualItem[];
  /** Total height of all items */
  totalHeight: number;
  /** Ref to attach to the outer spacer element */
  spacerRef: RefObject<HTMLDivElement | null>;
  /** Scroll to a specific item index */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  /** Recalculate layout (call after data changes affecting sizes) */
  recalculate: () => void;
}

/**
 * Custom hook for virtual scrolling with fixed or dynamic item heights.
 * Compatible with dnd-kit's SortableContext.
 */
export function useVirtualScroll(options: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const {
    itemCount,
    getSize,
    containerHeight,
    overscan = 3,
    scrollContainerRef,
    estimatedItemSize = 48,
    scrollResetKey,
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [version, setVersion] = useState(0); // Force recalculation
  const spacerRef = useRef<HTMLDivElement>(null);

  const scrollToFn = useCallback((top: number, behavior?: ScrollBehavior) => {
    if (scrollContainerRef?.current) {
      scrollContainerRef.current.scrollTo({ top, behavior });
    } else if (spacerRef.current?.parentElement) {
      spacerRef.current.parentElement.scrollTo({ top, behavior });
    }
  }, [scrollContainerRef]);

  // Listen for scroll events
  useEffect(() => {
    const container = scrollContainerRef?.current || spacerRef.current?.parentElement;
    if (!container) return;

    const handleScroll = () => setScrollTop(container.scrollTop);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef, version]);

  // Reset scroll position when key changes
  useEffect(() => {
    if (scrollResetKey !== undefined) {
      scrollToFn(0);
      setScrollTop(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollResetKey]);

  // Calculate positions cache
  const { offsets, totalHeight } = useMemo(() => {
    const offsets: number[] = new Array(itemCount + 1).fill(0);
    let accumulated = 0;
    for (let i = 0; i < itemCount; i++) {
      offsets[i] = accumulated;
      accumulated += getSize(i);
    }
    offsets[itemCount] = accumulated;
    return { offsets, totalHeight: accumulated };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, version]); // Rebuild when version increments

  // Find start index using binary search
  const startIndex = useMemo(() => {
    if (itemCount === 0 || scrollTop <= 0) return 0;
    
    let low = 0;
    let high = itemCount - 1;
    
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (offsets[mid] <= scrollTop) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return Math.max(0, low - overscan);
  }, [scrollTop, itemCount, offsets, overscan]);

  // Build virtual items list
  const virtualItems: VirtualItem[] = useMemo(() => {
    const result: VirtualItem[] = [];
    let currentOffset = startIndex > 0 ? offsets[startIndex] : 0;
    
    for (let i = startIndex; i < itemCount; i++) {
      const size = getSize(i);
      
      // Stop if past visible area + overscan
      if (currentOffset > scrollTop + containerHeight + overscan * estimatedItemSize) break;
      
      result.push({ index: i, offsetTop: currentOffset, size });
      currentOffset += size;
    }

    return result;
  }, [startIndex, itemCount, getSize, offsets, scrollTop, containerHeight, overscan, estimatedItemSize]);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
    if (index < 0 || index >= itemCount) return;
    scrollToFn(offsets[index], behavior);
  }, [itemCount, offsets, scrollToFn]);

  const recalculate = useCallback(() => setVersion(v => v + 1), []);

  return { virtualItems, totalHeight, spacerRef, scrollToIndex, recalculate };
}

/**
 * HOC wrapper: Wraps children in an absolute-positioned container
 * for use within a virtual scrolling context.
 */
export function VirtualRow(props: {
  item: VirtualItem;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${props.item.offsetTop}px)`,
        height: `${props.item.size}px`,
      }}
    >
      {props.children}
    </div>
  );
}
