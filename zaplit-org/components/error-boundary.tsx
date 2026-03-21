"use client"

import { Component, ErrorInfo, ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createComponentLogger } from "@/lib/logger"

const logger = createComponentLogger("error-boundary")

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * @example
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error with structured logging
    logger.error({
      err: error,
      componentStack: errorInfo.componentStack,
      component: 'ErrorBoundary',
      location: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
    }, "Uncaught error in error boundary");
    
    // Send to error tracking service if available
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, { 
        extra: { 
          componentStack: errorInfo.componentStack 
        },
        tags: { 
          component: 'ErrorBoundary',
          location: window.location.pathname 
        }
      });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[200px] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm mb-4">
              We apologize for the inconvenience. Please try again or contact support if the problem persists.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleReset} variant="outline">
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mt-6 p-4 bg-muted rounded-lg text-left">
                <p className="text-xs font-mono text-destructive mb-2">Error Details (Development Only):</p>
                <pre className="text-xs text-muted-foreground overflow-auto">
                  {this.state.error.message}
                  {this.state.error.stack}
                </pre>
              </div>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Section Error Boundary
 * 
 * A lighter error boundary for use within sections of a page.
 * Prevents a single section error from crashing the entire page.
 */
export function SectionErrorBoundary({ 
  children, 
  sectionName = "section" 
}: { 
  children: ReactNode
  sectionName?: string 
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 border border-border rounded-lg bg-card">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{sectionName} unavailable</span>
          </div>
          <p className="text-sm text-muted-foreground">
            This section encountered an error. Please refresh the page to try again.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
