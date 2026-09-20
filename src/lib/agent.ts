/**
 * Base URL of the agentic backend (FastAPI + LangGraph, port 8001).
 *
 * Client components read NEXT_PUBLIC_AGENT_BACKEND_URL; server routes use the
 * non-public AGENT_BACKEND_URL. Both fall back to localhost for dev.
 */
export const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ?? 'http://localhost:8001';
