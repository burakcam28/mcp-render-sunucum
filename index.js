import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 3000; 

// Render'in arka plandaki proxy ayarlarina uyum sagla
app.set('trust proxy', 1);

// Her turlu CORS engelini ve Gemini'nin gizli (OPTIONS) pinglerini onayla
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors()); 
app.use(express.json());

// RÖNTGEN: Sunucuya kapidan giren her seyi loglar
app.use((req, res, next) => {
  console.log(`[GELEN ISTEK] ${req.method} ${req.originalUrl}`);
  next();
});

const aktifBaglantilar = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

app.get('/mcp', async (req, res) => {
  const sessionId = generateSessionId();
  console.log(`[${sessionId}] SSE Baglantisi Hazirlaniyor...`);
  
  const izoleSunucu = new Server({
    name: `gemini-mcp-${sessionId}`,
    version: "1.0.0"
  }, {
    capabilities: { tools: {} }
  });

  // Gemini bos sunucu gorup kacmasin diye sahte arac
  izoleSunucu.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [{
        name: "sunucu_testi",
        description: "Sunucunun baglantisini test eder",
        inputSchema: { type: "object", properties: {} }
      }]
    };
  });

  izoleSunucu.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sunucu_testi") {
      return { content: [{ type: "text", text: "Sunucu mukemmel calisiyor!" }] };
    }
    throw new Error("Bilinmeyen arac");
  });

  res.setHeader('X-Accel-Buffering', 'no');

  // ÇÖZÜM: Portlari söküp atan, en temiz yalin domaini veren req.hostname kullaniyoruz!
  const temizHost = req.hostname;
  const mesajLinkimiz = `https://${temizHost}/mcp/messages/${sessionId}`;
  console.log(`[${sessionId}] Gemini'ye verilen TEMIZ link: ${mesajLinkimiz}`);

  const transport = new SSEServerTransport(mesajLinkimiz, res);
  aktifBaglantilar.set(sessionId, { sunucu: izoleSunucu, transport: transport });

  await izoleSunucu.connect(transport);
  console.log(`[${sessionId}] Baglanti Tamamlandi! Mesaj bekleniyor...`);
  
  res.on('close', () => {
     aktifBaglantilar.delete(sessionId);
     console.log(`[${sessionId}] ❌ Baglanti koptu veya sonlandirildi.`);
  });
});

app.post('/mcp/messages/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!aktifBaglantilar.has(sessionId)) {
    return res.status(404).send("Oturum bulunamadi.");
  }
  const { transport } = aktifBaglantilar.get(sessionId);
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu Port ${PORT} uzerinde hazir!`);
});
