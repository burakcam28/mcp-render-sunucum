import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// Tool eklemek için gereken resmi paketler
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const mcpServer = new Server({
  name: "gemini-mcp",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// GEMİNİ BOŞ SUNUCUYU REDDETMESİN DİYE TEST TOOL'U EKLİYORUZ
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: "sunucu_testi",
      description: "Sunucunun Gemini ile baglantisini test eder",
      inputSchema: { type: "object", properties: {} }
    }]
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "sunucu_testi") {
    return { content: [{ type: "text", text: "Bağlantı %100 başarılı, sunucu çalışıyor!" }] };
  }
  throw new Error("Bilinmeyen tool");
});

let aktifTransport = null;

// /mcp YERİNE DOĞRUDAN ANA DİZİNE (/) KURUYORUZ
app.get('/', async (req, res) => {
  console.log("-> GET / : Gemini'den Ana Baglanti Istegi Geldi!");
  
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Render'ın bağlantıyı bekletmesini %100 engeller

  if (aktifTransport) {
    try { await aktifTransport.close(); } catch(e) {}
  }
  
  aktifTransport = new SSEServerTransport('/messages', res);
  await mcpServer.connect(aktifTransport);
});

app.post('/messages', async (req, res) => {
  console.log("-> POST /messages : Gemini'den Komut Geldi!");
  if (!aktifTransport) {
    return res.status(400).send("Baglanti yok");
  }
  await aktifTransport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu yayinda! Port: ${PORT}`);
});
