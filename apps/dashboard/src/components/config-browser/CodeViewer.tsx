'use client'

import { type FC, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../../contexts/ThemeContext'

interface CodeViewerProps {
  content: string
  language?: string
  showLineNumbers?: boolean
}

export const CodeViewer: FC<CodeViewerProps> = ({
  content,
  language = 'markdown',
  showLineNumbers = true,
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Strip the theme's own background so only customStyle.backgroundColor (var(--bg-code))
  // is used. Without this, the inner <code> element keeps the theme's background color
  // (e.g. oneDark's #282c34 vs our --bg-code: #141414), making every line look highlighted.
  const syntaxTheme = useMemo(() => {
    const baseTheme = isDark ? oneDark : oneLight
    const base = baseTheme as Record<string, React.CSSProperties>
    return {
      ...baseTheme,
      'pre[class*="language-"]': {
        ...base['pre[class*="language-"]'],
        background: 'transparent',
      },
      'code[class*="language-"]': {
        ...base['code[class*="language-"]'],
        background: 'transparent',
      },
    }
  }, [isDark])

  return (
    <div className="relative overflow-x-auto">
      <SyntaxHighlighter
        language={language}
        style={syntaxTheme}
        showLineNumbers={showLineNumbers}
        customStyle={{
          margin: 0,
          padding: '1.25rem',
          backgroundColor: 'var(--bg-code)',
          fontSize: '0.9375rem',
          lineHeight: '1.6',
          borderRadius: '0.5rem',
        }}
        codeTagProps={{
          style: {
            background: 'transparent',
          },
        }}
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1em',
          color: 'var(--text-muted)',
          opacity: 0.5,
        }}
        wrapLongLines={false}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  )
}
