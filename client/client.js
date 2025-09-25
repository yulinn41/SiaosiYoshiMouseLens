// 使用 Vite 的 ESM Import
import { bootstrapCameraKit, createMediaStreamSource } from "@snap/camera-kit";

// ====== 設定區 ======
const STAGING_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-U1RBR0lOR35hN2RjY2E1Mi1mZGE2LTQ1OTMtYmRiZi0wNTIyZWI2ODBkYzMifQ.StaPVdkTYaerjGzSwG6DGQt3CVixLOVoI569-iBj_BU";
const PRODUCTION_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-UFJPRFVDVElPTn4xYTU1Zjc2MS02MjJiLTQyZmEtOTRiYi1iYzAxNDA2OWJjZjMifQ.j5HJ1j_XRke3xMKGb0eKdwbgaKAHDUhl_r2caKjJNSU";
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
  // 檢查並關閉舊的連線
  if (pc) {
    pc.close();
    console.log("舊的 RTCPeerConnection 已關閉");
     // 處理連線狀態變更
  pc.onconnectionstatechange = () => {
    console.log("WebRTC 連線狀態:", pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      console.log("❌ WebRTC 連線中斷");
      remoteVideo.srcObject = null;
    }
    
    if (pc.connectionState === 'connected' && checkInterval) {
         clearInterval(checkInterval); 
    }
  };

  // ... (保留 ws.onopen, ws.onmessage, startCall 等其他代碼) ...

  // 【⭐ 新增呼叫：啟動定時檢查】
  startConnectionCheck();
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

  // 處理連線狀態變更
  pc.onconnectionstatechange = () => {
    console.log("WebRTC 連線狀態:", pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      console.log("❌ WebRTC 連線中斷");
      remoteVideo.srcObject = null;
    }
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

    ws.send(JSON.stringify({ type: "request_call" }));
    console.log("📤 Sent 'request_call' to server.");

  };
ws.onmessage = async e => {
    const msg = JSON.parse(e.data);

    // 【⭐ 新增邏輯：收到同伴的重連請求】
    if (msg.type === "peer_reconnect_request") {
        console.log("📩 收到同伴重連請求，立即重啟 WebRTC 連線...");
        // 收到這個信號時，客戶端會關閉舊連線，並發送自己的 'request_call' 信號。
        setupWebRTC(); 
        return;
    }

    // 如果收到伺服器的連線請求，則發起 offer
    if (msg.type === "start_call_request") {
        console.log("📩 收到伺服器連線請求，發起 Offer...");
        startCall();
        return;
    }
    
    
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
}

// 建立 Offer
async function startCall() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ offer }));
  console.log("📤 Sent offer");
}

// ====== 事件監聽器 ======
// 頁面載入時自動啟動 Camera Kit 和 WebRTC
window.onload = setupCameraKit;

// 點擊按鈕時，重新啟動 WebRTC
reconnectBtn.addEventListener("click", () => {
  console.log("--- 重新啟動 WebRTC 連線 ---");
  setupWebRTC();
});

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
    } else {
        // 如果 pc 尚未初始化 (例如剛打開網頁時)，可以選擇在此呼叫 setupWebRTC()
        // 但由於 setupCameraKit 已經會在頁面載入時呼叫 setupWebRTC，通常不需要。
    }
  }, 15000); // 15000 毫秒 = 15 秒
  console.log("⚙️ 開始自動連線狀態檢查 (每 15 秒)");
}