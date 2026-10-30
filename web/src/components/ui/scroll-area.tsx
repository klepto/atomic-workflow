import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';
import type { ReactNode, Ref, UIEventHandler } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `ScrollArea`: its content, and the classes, the ref and the scroll handler of its parts.
 */
interface ScrollAreaProps {
  /**
   * Content that scrolls.
   */
  readonly children: ReactNode;

  /**
   * Classes of the outer box, which sets the size of the area.
   */
  readonly className?: string;

  /**
   * Classes of the box that scrolls.
   */
  readonly viewportClassName?: string;

  /**
   * Ref to the box that scrolls.
   */
  readonly viewportRef?: Ref<HTMLDivElement>;

  /**
   * Handler of the event `scroll` of the box that scrolls.
   */
  readonly onScroll?: UIEventHandler<HTMLDivElement>;
}

/**
 * Props of `ScrollBar`.
 */
interface ScrollBarProps {
  /**
   * Direction that the scrollbar scrolls.
   */
  readonly orientation: 'vertical' | 'horizontal';
}

/**
 * Scrollbar of the direction `orientation` of a scroll area. It is hidden until the content scrolls or the pointer is
 * on it, and fades out again once the scrolling stops. It is not there while the content fits in that direction.
 */
const ScrollBar = ({ orientation }: ScrollBarProps) => (
  <ScrollAreaPrimitive.Scrollbar
    data-slot="scroll-area-scrollbar"
    orientation={orientation}
    className="z-30 flex touch-none select-none p-0.5 opacity-0 transition-opacity duration-500 hover:opacity-100 hover:duration-150 data-[orientation=horizontal]:h-2.5 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-scrolling:opacity-100 data-scrolling:duration-150 motion-reduce:transition-none"
  >
    <ScrollAreaPrimitive.Thumb data-slot="scroll-area-thumb" className="flex-1 rounded-full bg-muted-foreground/45" />
  </ScrollAreaPrimitive.Scrollbar>
);

/**
 * Box whose content `children` scrolls inside it, in either direction, without a scrollbar of the browser. Its own
 * scrollbars lie over the content and show only while the content scrolls. The content is a column at least as high
 * as the box. `className` sizes the box, `viewportClassName` adds classes to the box that scrolls, `viewportRef` refers
 * to it, and `onScroll` handles its event `scroll`.
 */
export const ScrollArea = ({ children, className, viewportClassName, viewportRef, onScroll }: ScrollAreaProps) => (
  <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('min-h-0 min-w-0', className)}>
    <ScrollAreaPrimitive.Viewport
      ref={viewportRef}
      onScroll={onScroll}
      data-slot="scroll-area-viewport"
      className={cn(
        'size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
        viewportClassName,
      )}
    >
      <ScrollAreaPrimitive.Content className="flex min-h-full flex-col">{children}</ScrollAreaPrimitive.Content>
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar orientation="vertical" />
    <ScrollBar orientation="horizontal" />
  </ScrollAreaPrimitive.Root>
);
