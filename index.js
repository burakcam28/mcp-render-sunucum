import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
const PORT = process.env.PORT || 3000; 

// Gemini Spark'ın özel test (ping) bağlantılarına izin ver
app.use(cors({
  origin: '*', // Her yerden gelen isteği kabul et
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const mcpServer = new Server({
  name: "gemini-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {} 
  }
});

let aktifTransport = null;

app.get('/mcp', async (req, res) => {
  console.log("-> /mcp: Gemini SSE Baglantisi baslatiliyor...");
  
  // Render'ın bağlantı koparmasını engelle
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Önceki bağlantı varsa kapat (Çakışmayı önle)
  if (aktifTransport) {
    try { await aktifTransport.close(); } catch(e) {}
  }
  
  // Mesaj yolunu mutlak URL olarak ayarla (Gemini'nin HTTP URL sistemine uygun)
  const messageUrl = `https://${req.headers.host}/mcp/messages`;
  aktifTransport = new SSEServerTransport(messageUrl, res);
  
  await mcpServer.connect(aktifTransport);
  console.log("-> /mcp: Baglanti KURULDU.");
});

// Gemini'nin OPTIONS testi (Preflight)
app.options('/mcp/messages', (req, res) => {
  res.sendStatus(200);
});

app.post('/mcp/messages', express.json(), async (req, res) => {
  if (!aktifTransport) {
    return res.status(400).send("Baglanti yok.");
  }
  await aktifTransport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu calisiyor: Port ${PORT}`);
});
