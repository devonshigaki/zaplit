/**
 * Button Component
 * 
 * A versatile button component with multiple variants and sizes.
 * Built on top of Radix UI Slot for polymorphic behavior.
 * 
 * @module components/ui/button
 * @access public
 * 
 * @example
 * // Default button
 * <Button>Click me</Button>
 * 
 * // Destructive variant (for dangerous actions)
 * <Button variant="destructive">Delete</Button>
 * 
 * // Outline variant
 * <Button variant="outline">Cancel</Button>
 * 
 * // Ghost variant (subtle, no background)
 * <Button variant="ghost">More options</Button>
 * 
 * // Link style
 * <Button variant="link">Learn more</Button>
 * 
 * // Different sizes
 * <Button size="sm">Small</Button>
 * <Button size="lg">Large</Button>
 * <Button size="icon"><Icon /></Button>
 * 
 * // As a child component (polymorphic)
 * <Button asChild><Link href="/">Home</Link></Button>
 */

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Button variant styles using class-variance-authority
 * 
 * @property default - Primary brand color button
 * @property destructive - Red button for dangerous actions (delete, remove)
 * @property outline - Bordered button with transparent background
 * @property secondary - Muted background button
 * @property ghost - Transparent with hover state only
 * @property link - Text-only button with underline on hover
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/**
 * Button component props
 * 
 * @property variant - Visual style variant of the button
 * @property size - Size preset for the button
 * @property asChild - When true, renders the button as its child element (polymorphic)
 */
interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** When true, renders the button as its child element */
  asChild?: boolean
}

/**
 * Button component
 * 
 * @param props - Button props including variant, size, and standard button attributes
 * @returns Button element with applied styles
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
