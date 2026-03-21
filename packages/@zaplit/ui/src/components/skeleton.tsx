/**
 * Skeleton Component
 * 
 * Loading placeholder with pulse animation.
 * 
 * @module @zaplit/ui/components/skeleton
 * @access public
 */

import { cn } from '@zaplit/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
