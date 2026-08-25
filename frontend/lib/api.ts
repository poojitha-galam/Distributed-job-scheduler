export const BASE_URL = "http://localhost:8000/api/v1";

export function getAuthToken() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("cws_token");
  }
  return null;
}

export function getProjectId() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("cws_project_id");
  }
  return null;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const projectId = getProjectId();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && options.method !== "GET" && options.method !== "DELETE") {
      headers.set("Content-Type", "application/json");
  }

  // Append project_id to query if not auth endpoint
  let url = `${BASE_URL}${endpoint}`;
  if (!endpoint.startsWith("/auth") && projectId) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}project_id=${projectId}`;
  }

  const response = await fetch(url, { cache: "no-store", ...options, headers });
  
  if (response.status === 401) {
      if (typeof window !== "undefined") {
          localStorage.removeItem("cws_token");
          localStorage.removeItem("cws_project_id");
          window.location.href = "/login";
      }
  }
  
  return response;
}
