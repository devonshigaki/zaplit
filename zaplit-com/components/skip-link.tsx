/**
 * Skip Link Component
 * 
 * Provides keyboard users a way to skip repetitive navigation
 * and jump directly to the main content. Essential for accessibility
 * (WCAG 2.4.1 - Bypass Blocks).
 * 
 * @see https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html
 */

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  );
}
