export const API_HTTP = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");
export const API_WS = (import.meta.env.VITE_WS_BASE ?? API_HTTP.replace(/^http/, "ws")).replace(/\/$/, "");
