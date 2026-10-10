import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const aktifBaglantilar = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

// 1. ASIL CANLI YAYIN KAPISI (/sse)
app.get('/sse', async (req, res) => {
  const sessionId = generateSessionId();
  console.log(`[${sessionId}] Gemini Canli Yayina (SSE) baglaniyor...`);
  
  const izoleSunucu = new Server({
    name: `gemini-sunucum-${sessionId}`,
    version: "1.0.0"
  }, { capabilities: { tools: {} } });

  // Gemini bos sunucu gorup reddetmesin diye zorunlu test araci
  izoleSunucu.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [{
        name: "sunucu_testi",
        description: "Baglantiyi test eder",
        inputSchema: { type: "object", properties: {} }
      }]
    };
  });

  izoleSunucu.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sunucu_testi") {
      return { content: [{ type: "text", text: "Sunucu mukemmel calisiyor kanka!" }] };
    }
    throw new Error("Bilinmeyen arac");
  });

  // Render'in bekletmesini önle ve SSE kimligini bas
  res.setHeader('X-Accel-Buffering', 'no');

  // Mesaj yolu icin temiz, soru isaretsiz tam link
  const mesajLinkimiz = `https://${req.hostname}/messages/${sessionId}`;
  
  const transport = new SSEServerTransport(mesajLinkimiz, res);
  aktifBaglantilar.set(sessionId, { sunucu: izoleSunucu, transport: transport });

  await izoleSunucu.connect(transport);
  console.log(`[${sessionId}] Baglanti kuruldu, mesaj bekleniyor...`);
  
  res.on('close', () => {
     aktifBaglantilar.delete(sessionId);
     console.log(`[${sessionId}] Baglanti sonlandi.`);
  });
});

// 2. MESAJ ALMA KAPISI (/messages)
app.post('/messages/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!aktifBaglantilar.has(sessionId)) {
    return res.status(404).send("Oturum bulunamadi.");
  }
  const { transport } = aktifBaglantilar.get(sessionId);
  await transport.handlePostMessage(req, res);
});

// Eger Gemini inatla eski /mcp linkine gelirse onu uyaralim
app.use((req, res) => {
  if (req.path === '/mcp') {
     console.log("UYARI: Gemini eski /mcp linkini deniyor!");
  }
  res.status(404).send("Lutfen sonu /sse olan linki kullanin.");
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu Port ${PORT} uzerinde hazir!`);
});
