/**
 * Utility Functions
 * 
 * Common utility functions used throughout the application.
 * 
 * @module @zaplit/utils/cn
 * @access public
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS classes with proper precedence handling
 * 
 * Combines clsx for conditional class merging and tailwind-merge
 * for Tailwind-specific class deduplication and conflict resolution.
 * 
 * @param inputs - Class values to merge (strings, objects, arrays)
 * @returns Merged class string with Tailwind conflicts resolved
 * 
 * @example
 * // Basic usage
 * cn('px-2 py-1', 'bg-blue-500')
 * // => 'px-2 py-1 bg-blue-500'
 * 
 * @example
 * // Conditional classes
 * cn('px-2', isActive && 'bg-blue-500', !isActive && 'bg-gray-200')
 * // => 'px-2 bg-blue-500' (when isActive is true)
 * 
 * @example
 * // Arrays of classes
 * cn(['flex', 'items-center'], 'justify-between')
 * // => 'flex items-center justify-between'
 * 
 * @example
 * // Object syntax for conditional classes
 * cn('px-2', { 'bg-blue-500': isActive, 'text-white': isPrimary })
 * // => 'px-2 bg-blue-500 text-white' (when both conditions are true)
 * 
 * @example
 * // Tailwind conflict resolution (later classes override earlier ones)
 * cn('px-2', 'px-4')  // px-4 wins
 * // => 'px-4'
 * 
 * cn('text-sm', 'text-lg')  // text-lg wins
 * // => 'text-lg'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
