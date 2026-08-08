"use client";

import { useEffect } from "react";
import { useAccessibility } from "@/lib/use-accessibility";

/**
 * Applies a student's accessibility preferences to the whole portal.
 *
 * Deliberately at the layout level rather than on the AI Teacher page: a
 * student who needs larger text needs it on their timetable and their results
 * too. Setting attributes on `<html>` means one set of CSS rules in
 * globals.css covers every page, including ones not written yet.
 *
 * Renders nothing.
 */
export function AccessibilityPreferences() {
  const { data } = useAccessibility();

  useEffect(() => {
    const root = document.documentElement;
    const flags = {
      "data-large-text": data?.largeText,
      "data-high-contrast": data?.highContrast,
      "data-dyslexia-font": data?.dyslexiaFont,
      "data-reduce-motion": data?.reduceMotion,
    };

    for (const [attribute, on] of Object.entries(flags)) {
      if (on) root.setAttribute(attribute, "true");
      else root.removeAttribute(attribute);
    }

    // Left in place on unmount on purpose: navigating between pages must not
    // flash the text back to its default size.
  }, [data?.largeText, data?.highContrast, data?.dyslexiaFont, data?.reduceMotion]);

  return null;
}
