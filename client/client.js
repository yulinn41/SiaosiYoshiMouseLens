// 使用 Vite 的 ESM Import
import { bootstrapCameraKit, createMediaStreamSource } from "@snap/camera-kit";


// ====== 設定區 ======
// 開發用：Staging Token（測試 localhost:8080）
const STAGING_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-U1RBR0lOR35hN2RjY2E1Mi1mZGE2LTQ1OTMtYmRiZi0wNTIyZWI2ODBkYzMifQ.StaPVdkTYaerjGzSwG6DGQt3CVixLOVoI569-iBj_BU";
// 上線用：Production Token（正式網域）
const PRODUCTION_API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU3MTg1NzgxLCJzdWIiOiI0MWQyNzcwYS1lYTg2LTRjMDctYmU0NS00M2Q5MzNmYzA1ZDl-UFJPRFVDVElPTn4xYTU1Zjc2MS02MjJiLTQyZmEtOTRiYi1iYzAxNDA2OWJjZjMifQ.j5HJ1j_XRke3xMKGb0eKdwbgaKAHDUhl_r2caKjJNSU";
const apiToken = import.meta.env.VITE_API_TOKEN;
console.log("Current API Token:", apiToken);

const lensId = "f864247c-6a5d-4c61-bec5-6b07d354200f";
const lensGroupId = "0190c6c5-c7fd-4d75-9fa9-e18dfecb854b";

// ====== DOM ======
const canvas = document.getElementById("localCanvas");
const remoteVideo = document.getElementById("remoteVideo");

// ====== Camera Kit 初始化 ======
(async () => {
  try {
    console.log("Bootstrapping Camera Kit...");

    const cameraKit = await bootstrapCameraKit({ apiToken });
    console.log("✅ CameraKit initialized:", cameraKit);

    const session = await cameraKit.createSession({ liveRenderTarget: canvas });
    console.log("✅ Session created:", session);

    // 啟用相機
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    console.log("✅ Got user media stream:", stream);

    const source = createMediaStreamSource(stream);
    await session.setSource(source);
    console.log("✅ Source set success");

    // 載入 Lens
    const lens = await cameraKit.lensRepository.loadLens(lensId, lensGroupId);
    await session.applyLens(lens);
    console.log("✅ Lens applied:", lens);

    await session.play();
    console.log("▶️ Session playing...");
  } catch (err) {
    console.error("❌ CameraKit init failed:", err);
  }
})();

// ====== WebRTC ======
const pc = new RTCPeerConnection();

// 根據 http/https 自動決定 ws/wss
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket("wss://snap-signaling-server.onrender.com");

// 本地濾鏡畫面推送
const canvasStream = canvas.captureStream(30);
canvasStream.getTracks().forEach(track => pc.addTrack(track, canvasStream));

// 接收遠端流
pc.ontrack = e => {
  console.log("✅ Remote stream received");
  remoteVideo.srcObject = e.streams[0];
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
  startCall();
};

ws.onmessage = async e => {
  const msg = JSON.parse(e.data);

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

// 建立 Offer
async function startCall() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ offer }));
  console.log("📤 Sent offer");
}