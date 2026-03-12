export type AppContext = {
  Variables: {
    requestId: string
    user: Record<string, unknown>
    session: Record<string, unknown>
  }
}
