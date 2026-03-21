import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/use-mobile.ts', 'src/use-toast.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2022',
  outDir: 'dist',
  external: ['react', 'react-dom'],
})
