import { FormEvent, useEffect, useState } from "react";
import {
  addFriend,
  fetchFeed,
  fetchFriends,
  fetchMe,
  login,
  logout,
  shareVideo,
  signup
} from "./api";

interface User {
  id: number;
  username: string;
}

interface ShareItem {
  id: number;
  note: string;
  createdAt: string;
  sender?: { id: number; username: string };
  video?: {
    id: number;
    url: string;
    title: string;
    thumbnail?: string;
    description?: string;
  };
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<ShareItem[]>([]);
  const [friends, setFriends] = useState<User[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await fetchMe();
        setUser(me);
        await reloadData();
      } catch (err) {
        console.debug("no active session", err);
      }
    })();
  }, []);

  async function reloadData(currentUser: User | null = user) {
    if (!currentUser) return;
    const [shares, friendList] = await Promise.all([fetchFeed(), fetchFriends()]);
    setFeed(shares);
    setFriends(friendList);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    setStatus("Signing in...");
    setError(null);
    try {
      const me = await login(username, password);
      setUser(me);
      setAuthMode("login");
      await reloadData(me);
      setStatus("Signed in as " + me.username);
    } catch (err: any) {
      setError(err.message || "Unable to sign in");
    } finally {
      event.currentTarget.reset();
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");
    setStatus("Creating account...");
    setError(null);
    try {
      await signup(username, password);
      setStatus("Account created. Please sign in.");
      setAuthMode("login");
    } catch (err: any) {
      setError(err.message || "Unable to sign up");
    } finally {
      event.currentTarget.reset();
    }
  }

  async function handleShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = String(form.get("url") || "").trim();
    const recipients = String(form.get("recipients") || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const note = String(form.get("note") || "");
    if (!url || recipients.length === 0) {
      setError("URL and at least one recipient are required");
      return;
    }
    setStatus("Fetching video details...");
    setError(null);
    try {
      await shareVideo({ url, recipients, note });
      setStatus("Shared video!");
      event.currentTarget.reset();
      await reloadData(user);
    } catch (err: any) {
      setError(err.message || "Unable to share video");
    }
  }

  async function handleAddFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    if (!username) return;
    setStatus("Adding friend...");
    setError(null);
    try {
      await addFriend(username);
      setStatus("Friend added");
      event.currentTarget.reset();
      await reloadData(user);
    } catch (err: any) {
      setError(err.message || "Unable to add friend");
    }
  }

  async function handleLogout() {
    setStatus("Signing out...");
    setError(null);
    try {
      await logout();
      setUser(null);
      setFeed([]);
      setFriends([]);
      setStatus("Signed out");
    } catch (err: any) {
      setError(err.message || "Unable to sign out");
    }
  }

  return (
    <div className="app">
      <header>
        <h1>VidShare</h1>
        {user ? (
          <div className="user-info">
            <span>Signed in as {user.username}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : null}
      </header>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}

      {!user ? (
        <section className="card auth">
          <div className="tabs">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              onClick={() => setAuthMode("signup")}
            >
              Sign Up
            </button>
          </div>

          {authMode === "login" ? (
            <form onSubmit={handleLogin} className="form">
              <label>
                Username
                <input name="username" required autoComplete="username" />
              </label>
              <label>
                Password
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              <button type="submit">Sign In</button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="form">
              <label>
                Username
                <input name="username" required autoComplete="username" />
              </label>
              <label>
                Password
                <input name="password" type="password" required autoComplete="new-password" />
              </label>
              <button type="submit">Create Account</button>
            </form>
          )}
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Share a video</h2>
            <form onSubmit={handleShare} className="form">
              <label>
                Video URL
                <input name="url" placeholder="https://" required />
              </label>
              <label>
                Recipients (comma separated usernames)
                <input name="recipients" placeholder="friend1, friend2" required />
              </label>
              <label>
                Note
                <textarea name="note" placeholder="Say something nice" rows={3} />
              </label>
              <button type="submit">Share</button>
            </form>
          </section>

          <section className="card">
            <h2>Friends</h2>
            <form onSubmit={handleAddFriend} className="inline-form">
              <input name="username" placeholder="Add by username" required />
              <button type="submit">Add</button>
            </form>
            <ul className="list">
              {friends.map((friend) => (
                <li key={friend.id}>@{friend.username}</li>
              ))}
              {friends.length === 0 && <li>No friends yet. Add someone!</li>}
            </ul>
          </section>

          <section className="card">
            <h2>Feed</h2>
            <ul className="feed">
              {feed.map((item) => (
                <li key={item.id} className="feed-item">
                  <div className="feed-header">
                    <strong>{item.video?.title ?? "Shared video"}</strong>
                    <span>from {item.sender?.username ?? "Unknown"}</span>
                  </div>
                  {item.video?.thumbnail && (
                    <img src={item.video.thumbnail} alt="thumbnail" className="thumbnail" />
                  )}
                  <p>{item.note}</p>
                  <a href={item.video?.url} target="_blank" rel="noreferrer">
                    Watch video
                  </a>
                </li>
              ))}
              {feed.length === 0 && <li>No videos yet. Share something!</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
