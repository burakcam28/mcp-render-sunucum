import express from 'express';
import cors from 'cors';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(cors());

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
  console.log("Yeni bir MCP baglantisi geldi!");
  transport = new SSEServerTransport("/mcp/messages", res);
  await mcpServer.connect(transport);
});

app.post('/mcp/messages', express.json(), async (req, res) => {
  if (!transport) {
    return res.status(503).send("MCP baglantisi yok.");
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`MCP Sunucusu ayakta! Port: ${PORT}`);
});