// client.js
// 使用 Vite 的 ESM Import
import { bootstrapCameraKit, createMediaStreamSource } from "@snap/camera-kit";

// ====== 設定區 ======
const STAGING_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-U1RBR0lOR35hN2RjY2E1Mi1mZGE2LTQ1OTMtYmRiZi0wNTIyZWI2ODBkYzMifQ.StaPVdkTYaerjGzSwG6DGQt3CVixLOVoI569-iBj_BU";
const PRODUCTION_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-UFJPRFVDVElPTn4xYTU1Zjc2MS02MjJiLTRjZmEtOTRiYi1iYzAxNDA2OWJjZjMifQ.j5HJ1j_XRke3xMKGb0eKdwbgaKAHDUhl_r2caKjJNSU";
const apiToken = import.meta.env.VITE_API_TOKEN;
console.log("Current API Token:", apiToken);

const lensId = "f864247c-6a5d-4c61-bec5-6b07d354200f";
const lensGroupId = "0190c6c5-c7fd-4d75-9fa9-e18dfecb854b";

// ====== DOM ======
const canvas = document.getElementById("localCanvas");
const remoteVideo = document.getElementById("remoteVideo");
const reconnectBtn = document.getElementById("reconnectBtn");

// ====== 全域變數以利管理連線狀態 ======
let pc;
let ws;
let cameraKitSession;
let checkInterval; // 【✅ 修正：定時器全域變數】

// ====== Camera Kit 初始化 ======
async function setupCameraKit() {
  try {
    console.log("Bootstrapping Camera Kit...");
    const cameraKit = await bootstrapCameraKit({ apiToken });
    console.log("✅ CameraKit initialized:", cameraKit);

    cameraKitSession = await cameraKit.createSession({ liveRenderTarget: canvas });
    console.log("✅ Session created:", cameraKitSession);

    // 啟用相機
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    console.log("✅ Got user media stream:", stream);

    const source = createMediaStreamSource(stream);
    await cameraKitSession.setSource(source);
    console.log("✅ Source set success");

    // 載入 Lens
    const lens = await cameraKit.lensRepository.loadLens(lensId, lensGroupId);
    await cameraKitSession.applyLens(lens);
    console.log("✅ Lens applied:", lens);

    await cameraKitSession.play();
    console.log("▶️ Session playing...");

    // 啟動 WebRTC
    setupWebRTC();

  } catch (err) {
    console.error("❌ CameraKit init failed:", err);
  }
}

// ====== WebRTC 相關邏輯 ======
function setupWebRTC() {
  // 【✅ 修正：在開始前清除定時器】
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null; 
  }

  // 檢查並關閉舊的連線
  if (pc) {
    pc.close();
    console.log("舊的 RTCPeerConnection 已關閉");
  }
  if (ws) {
    ws.close();
    console.log("舊的 WebSocket 已關閉");
  }

  // 重新初始化 RTCPeerConnection
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  // 根據 http/https 自動決定 ws/wss
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://snap-signaling-server.onrender.com`);

  // 本地濾鏡畫面推送
  const canvasStream = canvas.captureStream(20);
  canvasStream.getTracks().forEach(track => pc.addTrack(track, canvasStream));

  // 接收遠端流
  pc.ontrack = e => {
    console.log("✅ Remote stream received");
    remoteVideo.srcObject = e.streams[0];
  };

  // 【✅ 修正：在新的 pc 上設置連線狀態變更處理】
  pc.onconnectionstatechange = () => {
    console.log("WebRTC 連線狀態:", pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      console.log("❌ WebRTC 連線中斷");
      remoteVideo.srcObject = null;
    }
    // 這裡我們只監聽狀態，重連交給定時器處理
  };

  // ICE candidate
  pc.onicecandidate = e => {
    if (e.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ candidate: e.candidate }));
      console.log("📡 Sending ICE candidate");
    }
  };

  // WebSocket 訊息
  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    // 連線建立時，發送請求給伺服器啟動 Offer/Answer 流程
    ws.send(JSON.stringify({ type: "request_call" }));
    console.log("📤 Sent 'request_call' to server.");
  };

  ws.onmessage = async e => {
    const msg = JSON.parse(e.data);

      // 🔧 這段是新加的
  if (data.type === "showDonut") {
    const donut = document.getElementById("donutImage");
    if (donut) {
      if (data.value) {
        donut.style.display = "block";
        console.log("🍩 台灣電腦 → 顯示甜甜圈");
      } else {
        donut.style.display = "none";
        console.log("🇯🇵 非台灣電腦 → 不顯示甜甜圈");
      }
    }
    return; // 不再繼續處理其他訊息
  }

  

    // 如果收到伺服器的連線請求 (start_call_request)，則發起 offer
    if (msg.type === "start_call_request") {
        console.log("📩 收到伺服器連線請求，發起 Offer...");
        startCall();
        return;
    }
    
    // 處理 Offer/Answer/Candidate (保持不變)
    if (msg.offer) {
      console.log("📩 Got offer");
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
      console.log("📤 Sent answer");
    }

    if (msg.answer) {
      console.log("📩 Got answer");
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    }

    if (msg.candidate) {
      console.log("📩 Got ICE candidate");
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  };
  
  // 【✅ 修正：在 setupWebRTC 結束時啟動檢查】
  startConnectionCheck();
}

// 建立 Offer
async function startCall() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ offer }));
  console.log("📤 Sent offer");
}

// ====== 定時檢查邏輯 ======
function startConnectionCheck() {
  // 清除舊的定時器，避免重複執行
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // 每 15 秒檢查一次連線狀態
  checkInterval = setInterval(() => {
    // 只有在 pc 存在且連線狀態不是 'connected' 或 'connecting' 時才嘗試重連
    if (pc && pc.connectionState !== 'connected' && pc.connectionState !== 'connecting') {
      console.log(`❌ WebRTC 閒置/中斷 (${pc.connectionState})，自動觸發重新連線...`);
      // 呼叫 setupWebRTC() 會關閉舊連線，建立新連線，並發送 'request_call'
      setupWebRTC();
    } else if (pc) {
      // 保持靜默，如果連線正常，不做任何事
      console.log(`✅ WebRTC 狀態良好: ${pc.connectionState}`);
    } 
  }, 15000); // 15000 毫秒 = 15 秒
  console.log("⚙️ 開始自動連線狀態檢查 (每 15 秒)");
}

// ====== 事件監聽器 ======
// 頁面載入時自動啟動 Camera Kit 和 WebRTC
window.onload = setupCameraKit;

// 點擊按鈕時，重新啟動 WebRTC
reconnectBtn.addEventListener("click", () => {
  console.log("--- 手動重新啟動 WebRTC 連線 ---");
  setupWebRTC();
});