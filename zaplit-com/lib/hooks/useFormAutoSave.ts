"use client";

import { useEffect, useCallback, useRef } from "react";

interface UseFormAutoSaveOptions<T> {
  formData: T;
  formId: string;
  enabled?: boolean;
  debounceMs?: number;
  onRestore?: (data: T) => void;
}

export function useFormAutoSave<T extends Record<string, unknown>>({
  formData,
  formId,
  enabled = true,
  debounceMs = 2000,
  onRestore,
}: UseFormAutoSaveOptions<T>) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = `form_autosave_${formId}`;

  // Save form data to localStorage
  const saveToStorage = useCallback(() => {
    if (!enabled) return;

    try {
      const dataToSave = {
        formData,
        timestamp: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    } catch (error) {
      console.error("[AutoSave] Failed to save:", error);
    }
  }, [formData, storageKey, enabled]);

  // Restore form data from localStorage
  const restoreFromStorage = useCallback((): T | null => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const parsed = JSON.parse(saved);
      const age = Date.now() - parsed.timestamp;

      // Only restore if less than 7 days old
      if (age > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return parsed.formData as T;
    } catch (error) {
      console.error("[AutoSave] Failed to restore:", error);
      return null;
    }
  }, [storageKey]);

  // Clear saved data
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error("[AutoSave] Failed to clear:", error);
    }
  }, [storageKey]);

  // Auto-save on form data change
  useEffect(() => {
    if (!enabled) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveToStorage();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [formData, debounceMs, enabled, saveToStorage]);

  // Restore on mount
  useEffect(() => {
    if (!enabled || !onRestore) return;

    const saved = restoreFromStorage();
    if (saved) {
      onRestore(saved);
    }
  }, [enabled, onRestore, restoreFromStorage]);

  return {
    clearStorage,
    restoreFromStorage,
    saveToStorage,
  };
}

// Hook to check if there's saved data
export function useHasSavedForm(formId: string): boolean {
  const storageKey = `form_autosave_${formId}`;

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return false;

    const parsed = JSON.parse(saved);
    const age = Date.now() - parsed.timestamp;

    // Only consider valid if less than 7 days old
    if (age > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(storageKey);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
