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

// Gelen her seyi gormek icin rontgen
app.use((req, res, next) => {
  console.log(`[ISTEK] ${req.method} ${req.originalUrl}`);
  next();
});

const aktifBaglantilar = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

// Ana sayfaya ping gelirse 200 dondur (Gemini bazen ana dizini kontrol eder)
app.get('/', (req, res) => res.send('MCP Sunucusu Aktif'));

// Asil baglanti kapimiz
app.get('/sse', async (req, res) => {
  const sessionId = generateSessionId();
  console.log(`[${sessionId}] SSE Baslatiliyor...`);
  
  // Render'in bekletmesini kapatiyoruz
  res.setHeader('X-Accel-Buffering', 'no');

  const izoleSunucu = new Server({
    name: `gemini-mcp-${sessionId}`,
    version: "1.0.0"
  }, { capabilities: { tools: {} } });

  // Gemini bos sunucu reddetmesin diye test araci
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
      return { content: [{ type: "text", text: "Mukemmel calisiyor!" }] };
    }
    throw new Error("Bilinmeyen arac");
  });

  // ÇÖZÜM BURASI: https:// falan yok, sadece temiz görece yol veriyoruz!
  const mesajLinkimiz = `/messages/${sessionId}`;
  
  const transport = new SSEServerTransport(mesajLinkimiz, res);
  aktifBaglantilar.set(sessionId, { sunucu: izoleSunucu, transport: transport });

  await izoleSunucu.connect(transport);
  console.log(`[${sessionId}] Endpoint verildi: ${mesajLinkimiz} (Mesaj bekleniyor)`);
  
  res.on('close', () => {
     aktifBaglantilar.delete(sessionId);
     console.log(`[${sessionId}] Baglanti kapandi.`);
  });
});

// Mesaj alma ucumuz
app.post('/messages/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!aktifBaglantilar.has(sessionId)) {
    return res.status(404).send("Oturum bulunamadi.");
  }
  
  console.log(`[${sessionId}] KOMUT ALINDI!`);
  const { transport } = aktifBaglantilar.get(sessionId);
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu Port ${PORT} uzerinde yayinda!`);
});
