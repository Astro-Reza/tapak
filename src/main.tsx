import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/geologica/400.css";
import "@fontsource/geologica/500.css";
import "@fontsource/geologica/600.css";
import "@fontsource/urbanist/500.css";
import "./index.css";

import App from "./App";
import { initMotionPreference } from "./lib/motion";

initMotionPreference();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
