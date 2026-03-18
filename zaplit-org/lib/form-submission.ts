import { useState, useCallback } from "react";

export type FormType = "consultation" | "contact" | "newsletter";

export interface FormSubmissionData {
  [key: string]: unknown;
}

export interface SubmissionMetadata {
  url: string;
  userAgent?: string;
}

export interface FormSubmissionPayload {
  formType: FormType;
  data: FormSubmissionData;
  metadata: SubmissionMetadata;
}

export interface UseFormSubmissionReturn {
  submitForm: (payload: FormSubmissionPayload) => Promise<{ success: boolean; id?: string; error?: string }>;
  isSubmitting: boolean;
  error: string | null;
  resetError: () => void;
}

/**
 * Hook for submitting forms to the n8n webhook API
 * 
 * @returns Object with submit function, loading state, and error handling
 * 
 * @example
 * ```tsx
 * const { submitForm, isSubmitting, error } = useFormSubmission();
 * 
 * const handleSubmit = async () => {
 *   const result = await submitForm({
 *     formType: "consultation",
 *     data: { name, email, company },
 *     metadata: { url: window.location.href }
 *   });
 *   
 *   if (result.success) {
 *     // Show success message
 *   }
 * };
 * ```
 */
export function useFormSubmission(): UseFormSubmissionReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitForm = useCallback(async (
    payload: FormSubmissionPayload
  ): Promise<{ success: boolean; id?: string; error?: string }> => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Add metadata
      const enrichedPayload: FormSubmissionPayload = {
        ...payload,
        metadata: {
          ...payload.metadata,
          url: payload.metadata.url || (typeof window !== "undefined" ? window.location.href : ""),
          userAgent: typeof window !== "undefined" ? navigator.userAgent : undefined,
        },
      };

      const response = await fetch("/api/submit-form", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(enrichedPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || "Failed to submit form. Please try again.";
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      return { success: true, id: data.id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    submitForm,
    isSubmitting,
    error,
    resetError,
  };
}

/**
 * Direct form submission function (for use outside of React components)
 * 
 * @param payload - The form submission payload
 * @returns Promise with submission result
 */
export async function submitFormDirect(
  payload: FormSubmissionPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const enrichedPayload: FormSubmissionPayload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        url: payload.metadata.url || (typeof window !== "undefined" ? window.location.href : ""),
        userAgent: typeof window !== "undefined" ? navigator.userAgent : undefined,
      },
    };

    const response = await fetch("/api/submit-form", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(enrichedPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "Failed to submit form" };
    }

    return { success: true, id: data.id };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "An unexpected error occurred" 
    };
  }
}
