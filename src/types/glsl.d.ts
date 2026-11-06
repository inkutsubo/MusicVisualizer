declare module '*.glsl?raw' {
  const src: string;
  export default src;
}

// role: TypeScript declaration for Vite `?raw` GLSL imports.
// invariants: only the ?raw suffix is declared; shader sources arrive as strings and are never
//             imported as modules.
// owner milestone: M3a
