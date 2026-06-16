'use client'

import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTheme } from '../../contexts/ThemeContext'

interface MarkdownViewerProps {
  content: string
}

export const MarkdownViewer: FC<MarkdownViewerProps> = ({ content }) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div
      className="prose max-w-none p-6 prose-headings:text-[var(--accent)] prose-a:text-[var(--accent)] prose-a:no-underline hover:prose-a:underline prose-code:text-[var(--accent)] prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0 prose-strong:text-[var(--text-primary)]"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '0.5rem',
        color: 'var(--text-primary)',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Keep pre but style it properly to preserve white-space contract
          pre: ({ children }) => (
            <pre
              style={{
                overflowX: 'auto',
                borderRadius: '0.5rem',
                margin: '1rem 0',
              }}
            >
              {children}
            </pre>
          ),
          // Code blocks with syntax highlighting
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            const content = String(children)
            const isBlockCode = content.includes('\n')

            if (match) {
              // Fenced code block with language
              return (
                <div className="not-prose my-4">
                  <SyntaxHighlighter
                    language={match[1]}
                    style={isDark ? oneDark : oneLight}
                    customStyle={{
                      margin: 0,
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    {content.replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              )
            }

            if (isBlockCode) {
              // Block code without language specifier — plain preformatted block
              return (
                <code
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre',
                    color: 'var(--text-primary)',
                  }}
                >
                  {children}
                </code>
              )
            }

            // True inline code
            return (
              <code
                {...props}
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '0.125rem 0.25rem',
                  borderRadius: '0.25rem',
                  color: 'var(--accent)',
                }}
              >
                {children}
              </code>
            )
          },
          // Enhanced table styling
          table: ({ children }) => (
            <div className="overflow-x-auto my-6">
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                padding: '0.75rem',
                border: '1px solid var(--border-subtle)',
                textAlign: 'left',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '0.75rem',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {children}
            </td>
          ),
          // Enhanced blockquote with accent border
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: '4px solid var(--accent)',
                paddingLeft: '1rem',
                marginLeft: 0,
                fontStyle: 'italic',
              }}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
