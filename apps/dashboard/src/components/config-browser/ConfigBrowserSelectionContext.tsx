"use client"
import React, { createContext, useContext } from 'react'

interface ConfigBrowserSelectionContextValue {
  anySelected: boolean
}

const ConfigBrowserSelectionContext = createContext<ConfigBrowserSelectionContextValue>({ anySelected: false })

export function ConfigBrowserSelectionProvider({
  children,
  anySelected,
}: { children: React.ReactNode; anySelected: boolean }) {
  return (
    <ConfigBrowserSelectionContext.Provider value={{ anySelected }}>
      {children}
    </ConfigBrowserSelectionContext.Provider>
  )
}

export function useConfigBrowserSelection() {
  return useContext(ConfigBrowserSelectionContext)
}
