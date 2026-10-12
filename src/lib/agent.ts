/**
 * Base URL of the agentic backend (FastAPI + LangGraph, port 8001).
 *
 * In browser client components, requests use '/api/agent' so Next.js proxies
 * them securely over HTTPS without Mixed Content or CORS errors.
 * In server-side routes, it connects directly to the backend URL.
 */
export const AGENT_URL =
  typeof window !== 'undefined'
    ? '/api/agent'
    : (process.env.AGENT_BACKEND_URL || process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || 'http://localhost:8001').replace(/\/$/, '');
