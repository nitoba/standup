// Type declarations for binary assets imported with `with { type: "file" }`.
// bun build --compile embeds these files into the standalone binary;
// at runtime the import resolves to the embedded file path.
declare module '*.webp' {
  const path: string
  export default path
}
