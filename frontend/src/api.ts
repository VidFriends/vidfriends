const API_BASE = import.meta.env.VITE_API_BASE ?? "/";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch (err) {
      console.error("Failed to parse error", err);
    }
    throw new Error(message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function fetchMe() {
  const data = await request<{ user: { id: number; username: string } }>(`${API_BASE}api/me`);
  return data.user;
}

export async function login(username: string, password: string) {
  const data = await request<{ user: { id: number; username: string } }>(`${API_BASE}api/login`, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  return data.user;
}

export async function signup(username: string, password: string) {
  await request(`${API_BASE}api/signup`, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function logout() {
  await request(`${API_BASE}api/logout`, { method: "POST" });
}

export async function fetchFeed() {
  const data = await request<{ shares: any[] }>(`${API_BASE}api/feed`);
  return data.shares;
}

export async function fetchFriends() {
  const data = await request<{ friends: any[] }>(`${API_BASE}api/friends`);
  return data.friends;
}

export async function addFriend(username: string) {
  await request(`${API_BASE}api/friends`, {
    method: "POST",
    body: JSON.stringify({ username })
  });
}

export async function shareVideo(payload: { url: string; recipients: string[]; note: string }) {
  await request(`${API_BASE}api/share`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
