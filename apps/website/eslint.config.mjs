import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Allow images without alt if wrapped in aria-hidden contexts
      '@next/next/no-img-element': 'warn',
      // Allow <a> tags for external links and anchors
      '@next/next/no-html-link-for-pages': 'warn',
      // Allow unescaped entities in JSX (marketing copy uses quotes/apostrophes)
      'react/no-unescaped-entities': 'off',
      // Allow HTML comments in JSX (existing code pattern)
      'react/jsx-no-comment-textnodes': 'warn',
    },
  },
]

export default eslintConfig
