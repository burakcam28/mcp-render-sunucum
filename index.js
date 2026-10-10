import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
const PORT = process.env.PORT || 3000; 

// Güvenlik duvarına takılmamak için CORS ayarını tam yetkili yapıyoruz
app.use(cors({ origin: true, credentials: true }));

const mcpServer = new Server({
  name: "gemini-mcp-render",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {} 
  }
});

let transport;

app.get('/mcp', async (req, res) => {
  console.log("-> /mcp: Gemini'den Canli (SSE) baglanti istegi geldi!");
  
  // Render'ın bağlantıyı kesmesini önleyen 4 kritik zorunlu başlık
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  const mesajLinkimiz = `https://${req.headers.host}/mcp/messages`;
  console.log("Mesaj adresi ayarlandi:", mesajLinkimiz);

  transport = new SSEServerTransport(mesajLinkimiz, res);
  await mcpServer.connect(transport);
});

app.post('/mcp/messages', express.json({ limit: '50mb' }), async (req, res) => {
  console.log("-> /mcp/messages: Gemini komut gonderdi!");
  if (!transport) {
    return res.status(503).send("MCP baglantisi henuz hazir degil.");
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu kusursuz calisiyor! Port: ${PORT}`);
});
