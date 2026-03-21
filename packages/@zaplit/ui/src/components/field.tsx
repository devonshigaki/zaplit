/**
 * Field Component
 * 
 * Form field wrapper with label, input, and error message.
 * 
 * @module @zaplit/ui/components/field
 * @access public
 */

import * as React from 'react'

import { cn } from '@zaplit/utils'
import { Label } from './label'

interface FieldProps extends React.ComponentProps<'div'> {
  label?: string
  error?: string
  htmlFor?: string
}

function Field({
  className,
  label,
  error,
  htmlFor,
  children,
  ...props
}: FieldProps) {
  return (
    <div data-slot="field" className={cn('grid gap-2', className)} {...props}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export { Field }
export type { FieldProps }
