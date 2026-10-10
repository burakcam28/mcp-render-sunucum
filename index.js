import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(cors());

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
  console.log("-> Gemini'den bağlantı isteği geldi!");
  
  // Render'ın bekletme yapmasını engelliyoruz
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Eğer eski bir bağlantı açık kalmışsa onu kapatıp temizliyoruz (Sorunu çözen kısım bu)
  if (aktifTransport) {
    try { await aktifTransport.close(); } catch(e) {}
  }
  
  // Karmaşık tam link yerine sadece kısa yolu veriyoruz
  aktifTransport = new SSEServerTransport('/mcp/messages', res);
  await mcpServer.connect(aktifTransport);
  console.log("-> Bağlantı başarıyla sağlandı!");
});

app.post('/mcp/messages', express.json(), async (req, res) => {
  if (!aktifTransport) {
    return res.status(400).send("Aktif bir bağlantı yok.");
  }
  await aktifTransport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 Sunucu kusursuz çalışıyor! Port: ${PORT}`);
});
