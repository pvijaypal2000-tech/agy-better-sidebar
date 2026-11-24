import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { ViewerApp } from "./ViewerApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ViewerApp />
  </React.StrictMode>,
);
