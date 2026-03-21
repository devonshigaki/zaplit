import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/response.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2022',
  outDir: 'dist',
  external: ['next'],
})
