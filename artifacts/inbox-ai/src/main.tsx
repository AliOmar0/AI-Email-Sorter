import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter, setAccountIdGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { API_BASE_URL, getAuthToken, setAuthToken, getActiveAccountId } from "@/lib/api-base";

// Cross-origin deploy: when VITE_API_BASE_URL is set the frontend lives on a
// different origin than the API, so it cannot use the session cookie. Point the
// API client at the remote backend, capture the bearer token the login redirect
// places in the URL fragment, and send it on every request. On Replit this
// whole block is skipped (API_BASE_URL is empty) and cookies are used.
if (API_BASE_URL) {
  setBaseUrl(API_BASE_URL);

  const match = window.location.hash.match(/[#&]token=([^&]+)/);
  if (match) {
    setAuthToken(decodeURIComponent(match[1]));
    // Strip the token from the URL so it isn't kept in history.
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }

  setAuthTokenGetter(() => getAuthToken());
}

// Multi-account: send the locally-selected active account on every request
// (both cookie and bearer modes). When unset the backend uses the primary.
setAccountIdGetter(() => getActiveAccountId());

createRoot(document.getElementById("root")!).render(<App />);
