import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

/** F3 (audit fix): minimal error boundary. Before this fix there was no
 *  error boundary anywhere, so any render error left a blank page. This
 *  one shows a reload button instead. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem 1rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1>出了点问题</h1>
          <p>页面遇到了一个错误，学习进度保存在本机浏览器里，不会因此丢失。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "0.6rem 1.4rem", fontSize: "1rem", cursor: "pointer" }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => null);
  });
}
