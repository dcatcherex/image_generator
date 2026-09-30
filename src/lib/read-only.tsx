"use client";

import { createContext, useContext } from "react";

// True for public viewers (anyone who isn't the owner). UI-only: it hides or disables write
// actions, while the real enforcement is requireOwner() in every write route handler.
const ReadOnlyContext = createContext(false);

export const ReadOnlyProvider = ReadOnlyContext.Provider;

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
