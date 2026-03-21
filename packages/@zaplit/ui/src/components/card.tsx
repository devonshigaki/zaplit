/**
 * Card Component
 * 
 * A flexible container component for grouping related content.
 * Composed of multiple sub-components: CardHeader, CardTitle, CardDescription,
 * CardContent, CardFooter, and CardAction.
 * 
 * @module @zaplit/ui/components/card
 * @access public
 * 
 * @example
 * // Basic card
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Card Title</CardTitle>
 *     <CardDescription>Card description text</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Main content goes here</p>
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 * 
 * @example
 * // Card with action in header
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Settings</CardTitle>
 *     <CardAction>
 *       <Button variant="ghost" size="icon"><Settings /></Button>
 *     </CardAction>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Configure your preferences</p>
 *   </CardContent>
 * </Card>
 */

import * as React from 'react'

import { cn } from '@zaplit/utils'

/**
 * Main card container component
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Card header section
 * Contains the title, description, and optional action
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Card title heading
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

/**
 * Card description text
 * Muted text that appears below the title
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

/**
 * Card action button container
 * Positions an action button in the header's top-right corner
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Card content area
 * Main content container with horizontal padding
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  )
}

/**
 * Card footer section
 * Typically contains action buttons
 * 
 * @param className - Additional CSS classes
 * @param props - Standard div element props
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
