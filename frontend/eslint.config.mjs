import { FlatCompat } from '@eslint/eslintrc';
import noPhysicalRtlClasses from './eslint-rules/no-physical-rtl-classes.js';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  {
    plugins: {
      local: { rules: { 'no-physical-rtl-classes': noPhysicalRtlClasses } },
    },
    rules: {
      'local/no-physical-rtl-classes': 'error',
    },
  },
];

export default eslintConfig;
