import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/global.css";
import "./index.css";

// Last-resort handlers. React's boundary only sees errors thrown while
// rendering; these catch the rest (async callbacks, failed fetches, Web Audio
// graph errors) which would otherwise be silent.
window.addEventListener("error", (e) => {
  console.error("[Cadence window error]:", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[Cadence unhandled rejection]:", e.reason);
});

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ErrorBoundary offerReload label="root">
      <App />
    </ErrorBoundary>
  );
} else {
  console.error("[Cadence] Root element #root not found");
}