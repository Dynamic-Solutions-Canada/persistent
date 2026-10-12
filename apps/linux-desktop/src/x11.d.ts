declare module 'x11' {
  const x11: {
    createClient(callback: (error: Error | null, display: import('./x11-types.js').XDisplay) => void): import('./x11-types.js').XClient
  }
  export default x11
}
