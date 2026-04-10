import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function startServer() {
  console.log("Starting server...");
  console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
  
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini API proxy route
  app.post("/api/gemini", async (req, res) => {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    console.log("Received request to /api/gemini");
    console.log("API Key present:", !!apiKey);
    console.log("Prompt length:", prompt?.length);

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Log the size of the prompt to help debug
      console.log("Sending prompt to Gemini, length:", prompt.length);
      
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log("Gemini response received");
      res.json({ text });
    } catch (error: any) {
      console.error("Gemini API error details:", error);
      // Send more detailed error information to the client
      const errorMessage = error.message || String(error);
      res.status(500).json({ 
        error: "Failed to call Gemini API", 
        details: errorMessage 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
