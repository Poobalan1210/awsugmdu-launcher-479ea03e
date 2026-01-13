import { createRoot } from "react-dom/client";
import "./lib/aws-config"; // Initialize AWS Amplify
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
