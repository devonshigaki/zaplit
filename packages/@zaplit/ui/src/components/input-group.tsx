/**
 * Input Group Component
 * 
 * Groups an input with addons (icons, buttons, text).
 * 
 * @module @zaplit/ui/components/input-group
 * @access public
 */

import * as React from 'react'

import { cn } from '@zaplit/utils'

interface InputGroupProps extends React.ComponentProps<'div'> {
  children: React.ReactNode
}

function InputGroup({ className, children, ...props }: InputGroupProps) {
  return (
    <div
      data-slot="input-group"
      className={cn('relative flex items-center', className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface InputGroupTextProps extends React.ComponentProps<'span'> {}

function InputGroupText({ className, ...props }: InputGroupTextProps) {
  return (
    <span
      data-slot="input-group-text"
      className={cn(
        'inline-flex items-center border bg-muted px-3 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupText }
export type { InputGroupProps, InputGroupTextProps }
