export const BASE_URL = "http://localhost:8000/api/v1";

export function getAuthToken() {
  if (typeof window !== "undefined") {
    // We can't read the HttpOnly token, so we check the auth_status cookie
    return document.cookie.includes("cws_auth_status=1");
  }
  return false;
}

export function getProjectId() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("cws_project_id");
  }
  return null;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const projectId = getProjectId();

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.method !== "GET" && options.method !== "DELETE") {
      headers.set("Content-Type", "application/json");
  }

  // Append project_id to query if not auth endpoint
  let url = `${BASE_URL}${endpoint}`;
  if (!endpoint.startsWith("/auth") && projectId) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}project_id=${projectId}`;
  }

  // Include credentials so HttpOnly cookies are sent
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options, headers });
  
  if (response.status === 401) {
      if (typeof window !== "undefined") {
          localStorage.removeItem("cws_project_id");
          // cws_token and cws_auth_status should be cleared by backend on logout
          window.location.href = "/login";
      }
  }
  
  return response;
}
