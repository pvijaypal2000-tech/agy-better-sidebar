import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { WorkbenchApp } from "./WorkbenchApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkbenchApp />
  </React.StrictMode>,
);
