// server.js (修正後)
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");


// 🔧 新增：node-fetch（用於查詢地理位置）
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 提供 public 目錄（index.html + client.js）
app.use(express.static(path.join(__dirname, "public")));

wss.on("connection", (ws, req) => {




  // 新增：檢查目前連線人數，如果超過兩位則拒絕
  if (wss.clients.size > 2) {
    console.log("連線人數已滿，拒絕新連線");
    ws.close(1000, "連線人數已滿，請稍後再試。");
    return; // 結束函數
  }

  console.log("新客戶端連線，目前連線數:", wss.clients.size);
// ✅ 取得 IP
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log("🔎 客戶端 IP:", ip);

  // ✅ 非阻塞 IP 地理位置查詢
  fetch(`https://ipapi.co/${ip}/json/`)
    .then(res => res.json())
    .then(info => {
      const country = info.country_name || "Unknown";
      console.log(`📍 來源國家：${country}`);
      const isTaiwan = country === "Taiwan";
      ws.send(JSON.stringify({ type: "showDonut", value: isTaiwan }));
    })
    .catch(err => {
      console.error("❌ IP 查詢失敗:", err);
      // 為了避免測試環境沒外網時阻斷流程
      ws.send(JSON.stringify({ type: "showDonut", value: true }));
    });

  // 【✅ 修正點 1：移除舊的連線啟動邏輯。不再依賴 wss.clients.size 來發送 start_call_request】
  
  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());
    
    // 【✅ 修正點 2：當收到 'request_call' 時，直接協調誰發起 Offer】
    if (data.type === "request_call") {
      console.log("📩 收到客戶端重新連線請求 ('request_call')");
      
      // 找到另一個連線的客戶端
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          // 向另一方發送 start_call_request，告訴它發起 Offer
          client.send(JSON.stringify({ type: "start_call_request" }));
          console.log("📤 已向另一方發送 'start_call_request' (發起 Offer 指令)");
        }
      });
      return; // 處理完畢
    }

    // 廣播訊息給所有其他客戶端 (Offer/Answer/Candidate 的邏輯)
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