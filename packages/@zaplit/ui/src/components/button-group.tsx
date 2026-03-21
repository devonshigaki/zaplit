/**
 * Button Group Component
 * 
 * Groups related buttons together.
 * 
 * @module @zaplit/ui/components/button-group
 * @access public
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@zaplit/utils'

const buttonGroupVariants = cva('inline-flex', {
  variants: {
    variant: {
      default: 'space-x-0',
      separated: 'space-x-2',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface ButtonGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof buttonGroupVariants> {}

function ButtonGroup({ className, variant, ...props }: ButtonGroupProps) {
  return (
    <div
      data-slot="button-group"
      className={cn(buttonGroupVariants({ variant }), className)}
      {...props}
    />
  )
}

export { ButtonGroup, buttonGroupVariants }
export type { ButtonGroupProps }
