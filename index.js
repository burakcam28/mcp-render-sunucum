import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

// Her Gemini bağlantısı için o bağlantıya özel, izole bir sunucu ve transport tutacağımız bir "depo"
const aktifBaglantilar = new Map();

// Benzersiz bir ID üretici (Basit bir çözüm)
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

app.get('/mcp', async (req, res) => {
  console.log("-> /mcp : Gemini'den Yeni Bir Baglanti Istegi Geldi!");
  
  const sessionId = generateSessionId();
  console.log(`-> Session olusturuldu: ${sessionId}`);

  // Her bağlantı için TAMAMEN YENİ bir sunucu objesi yaratıyoruz (Çökme hatasını bitiren hamle)
  const izoleSunucu = new Server({
    name: `gemini-mcp-${sessionId}`,
    version: "1.0.0"
  }, {
    capabilities: { tools: {} }
  });

  // Gemini'nin "bu sunucu boş" deyip kaçmaması için sahte test aracımız (tool)
  izoleSunucu.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [{
        name: "sunucu_testi",
        description: "Sunucunun Gemini ile baglantisini test eder",
        inputSchema: { type: "object", properties: {} }
      }]
    };
  });

  izoleSunucu.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "sunucu_testi") {
      return { content: [{ type: "text", text: "Bağlantı %100 başarılı, sunucu çalışıyor!" }] };
    }
    throw new Error("Bilinmeyen tool");
  });

  // Sadece Render'ın bekletmesini kapatıyoruz
  res.setHeader('X-Accel-Buffering', 'no');

  // Bu spesifik session (oturum) için mesaj adresini tanımlıyoruz
  const mesajLinkimiz = `/mcp/messages?sessionId=${sessionId}`;
  const transport = new SSEServerTransport(mesajLinkimiz, res);

  // Sunucu ve transportu "depo"muza kaydediyoruz
  aktifBaglantilar.set(sessionId, { sunucu: izoleSunucu, transport: transport });

  // O bağlantıya özel sunucuyu başlatıyoruz
  await izoleSunucu.connect(transport);
  console.log(`-> ${sessionId} baglantisi basariyla kuruldu!`);

  // Eğer Gemini bir süre sonra bağlantıyı keserse, depodan temizliyoruz
  res.on('close', () => {
     console.log(`-> Baglanti kapandi, temizleniyor: ${sessionId}`);
     aktifBaglantilar.delete(sessionId);
  });
});

app.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId || !aktifBaglantilar.has(sessionId)) {
    return res.status(400).send("Gecersiz veya kopmus baglanti.");
  }

  console.log(`-> /mcp/messages : ${sessionId} icin komut geldi!`);
  const { transport } = aktifBaglantilar.get(sessionId);
  
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Sunucusu yayinda (Coklu Oturum Destekli)! Port: ${PORT}`);
});
