/**
 * Label Component
 * 
 * Form label component built on Radix UI Label primitive.
 * 
 * @module @zaplit/ui/components/label
 * @access public
 */

'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@zaplit/utils'

/**
 * Label component
 * 
 * @param className - Additional CSS classes
 * @param props - Standard label element props
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
