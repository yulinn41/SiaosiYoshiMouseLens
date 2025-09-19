const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 提供 public 目錄（index.html + client.js）
app.use(express.static(path.join(__dirname, "public")));

wss.on("connection", ws => {
  // 新增：檢查目前連線人數，如果超過兩位則拒絕
  if (wss.clients.size > 2) {
    console.log("連線人數已滿，拒絕新連線");
    ws.close(1000, "連線人數已滿，請稍後再試。");
    return; // 結束函數
  }

  console.log("新客戶端連線，目前連線數:", wss.clients.size);

  // 如果目前連線數恰好是兩位，代表有其他人在線，通知新連線者發起連線
  if (wss.clients.size === 2) {
    ws.send(JSON.stringify({ type: "start_call_request" }));
    console.log("已發送 'start_call_request' 給新連線者");
  }

  ws.on("message", msg => {
    // 廣播訊息給所有其他客戶端
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("客戶端斷開連線，目前連線數:", wss.clients.size);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});