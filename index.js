import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors()); 
app.use(express.json());

// RÖNTGEN
app.use((req, res, next) => {
  console.log(`[GELEN ISTEK] ${req.method} ${req.originalUrl}`);
  next();
});

const aktifBaglantilar = new Map();
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

// ÇÖZÜM İŞTE BURADA: Gemini Ping (HEAD) attığında anında onay verip gönderiyoruz!
app.head('/mcp', (req, res) => {
  console.log("-> [PING ONAYI] Gemini test pıngi atti, aninda onaylandi!");
  res.status(200).end();
});

// Gerçek bağlantı (GET) geldiğinde yayın başlıyor
app.get('/mcp', async (req, res) => {
  const sessionId = generateSessionId();
  console.log(`[${sessionId}] Asil SSE Baglantisi Hazirlaniyor...`);
  
  const izoleSunucu = new Server({
    name: `gemini-mcp-${sessionId}`,
    version: "1.0.0"
  }, { capabilities: { tools: {} } });

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

  const temizHost = req.hostname;
  const mesajLinkimiz = `https://${temizHost}/mcp/messages/${sessionId}`;

  const transport = new SSEServerTransport(mesajLinkimiz, res);
  aktifBaglantilar.set(sessionId, { sunucu: izoleSunucu, transport: transport });

  await izoleSunucu.connect(transport);
  console.log(`[${sessionId}] Baglanti Tamamlandi! Mesaj bekleniyor...`);
  
  res.on('close', () => {
     aktifBaglantilar.delete(sessionId);
     console.log(`[${sessionId}] ❌ Baglanti sonlandirildi.`);
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
