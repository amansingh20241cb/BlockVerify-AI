// ---- CONFIG: paste your deployed contract address from Remix here ----
const CONTRACT_ADDRESS = "0x5FBEAAf71Ce87Cf784802893A246c62881D70AC1";
// ---------------------------------------------------------------------
const SEPOLIA_CHAIN_ID = "0xaa36a7";
const PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ABI = [
  "function registerDocument(bytes32 hash)",
  "function verifyDocument(bytes32 hash) view returns (bool exists, address registrant, uint256 timestamp)"
];

const $ = id => document.getElementById(id);
let currentHash = null, signer = null;

function say(id, text, kind) { const e = $(id); e.textContent = text; e.className = "msg " + (kind || ""); }
function setWalletStatus(text) { const el = $("networkStatus"); if (el) el.textContent = text; }
function contractReady() { return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS); }

async function sha256Browser(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// File picker feedback and drag-and-drop support.
const analyzeInput = $("analyzeFile");
const dropzone = $("dropzone");
if (analyzeInput) analyzeInput.addEventListener("change", () => {
  $("fileName").textContent = analyzeInput.files[0] ? analyzeInput.files[0].name : "No file selected";
});
if (dropzone && analyzeInput) {
  ["dragenter", "dragover"].forEach(name => dropzone.addEventListener(name, e => {
    e.preventDefault(); dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(name => dropzone.addEventListener(name, e => {
    e.preventDefault(); dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer(); transfer.items.add(file); analyzeInput.files = transfer.files;
    $("fileName").textContent = file.name;
  });
}

// ---------- 1. Analyze ----------
$("analyzeBtn").onclick = async () => {
  const file = $("analyzeFile").files[0];
  if (!file) return say("analyzeMsg", "Please choose a document first.", "bad");
  say("analyzeMsg", "Analyzing…");
  const fd = new FormData(); fd.append("document", file);
  try {
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return say("analyzeMsg", data.error || "Analysis failed.", "bad");
    renderReport(data);
    say("analyzeMsg", "Done.", "ok");
  } catch (e) { say("analyzeMsg", "Could not reach the server.", "bad"); }
};

function renderReport(d) {
  currentHash = d.hash;
  $("report").hidden = false;
  $("emptyState").hidden = true;
  $("analysisStatus").textContent = "REPORT READY";
  $("score").textContent = d.analysis.score;
  $("label").textContent = d.analysis.label;
  $("summary").textContent = d.analysis.summary;
  $("hash").textContent = d.hash;
  $("fileInfo").textContent = `${d.filename} · ${d.size.toLocaleString()} bytes`;
  $("fileName").textContent = d.filename;
  const ul = $("checks"); ul.innerHTML = "";
  d.analysis.checks.forEach(c => {
    const li = document.createElement("li");
    li.className = c.status;
    const b = document.createElement("strong"); b.textContent = c.name + ": ";
    li.append(b, document.createTextNode(c.detail));
    ul.appendChild(li);
  });
  $("registerBtn").disabled = !signer;
}
$("copyHash").onclick = () => { if (currentHash) navigator.clipboard.writeText(currentHash); $("copyHash").textContent = "Copied"; setTimeout(() => $("copyHash").textContent = "Copy", 1200); };

// ---------- 2. Wallet + register ----------
async function ensureSepolia() {
  const chain = await window.ethereum.request({ method: "eth_chainId" });
  if (chain === SEPOLIA_CHAIN_ID) return;
  await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID }] });
}

$("connectBtn").onclick = async () => {
  if (!window.ethereum) return say("walletMsg", "MetaMask not found. Install the MetaMask extension.", "bad");
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureSepolia();
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    const addr = await signer.getAddress();
    say("walletMsg", `Connected: ${addr.slice(0, 6)}…${addr.slice(-4)} on Sepolia`, "ok");
    setWalletStatus(`${addr.slice(0, 6)}…${addr.slice(-4)}`);
    $("connectBtn").textContent = "◈ Wallet connected";
    $("registerBtn").disabled = !currentHash;
  } catch (e) { say("walletMsg", "Wallet connection failed: " + (e.shortMessage || e.message), "bad"); }
};

$("registerBtn").onclick = async () => {
  if (!contractReady()) return say("registerMsg", "Set CONTRACT_ADDRESS in static/app.js first (deploy via Remix).", "bad");
  if (!currentHash) return say("registerMsg", "Analyze a document first.", "bad");
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    say("registerMsg", "Confirm the transaction in MetaMask…");
    const tx = await contract.registerDocument("0x" + currentHash);
    say("registerMsg", "Waiting for confirmation… tx " + tx.hash.slice(0, 12) + "…");
    await tx.wait();
    say("registerMsg", "Registered on Sepolia. Tx: " + tx.hash, "ok");
  } catch (e) {
    const m = (e.reason || e.shortMessage || e.message || "").toString();
    say("registerMsg", m.includes("already registered") ? "This exact fingerprint is already registered." : "Registration failed: " + m, "bad");
  }
};

// ---------- 3. Verify ----------
$("verifyBtn").onclick = async () => {
  const file = $("verifyFile").files[0];
  if (!file) return say("verifyMsg", "Please choose a file to verify.", "bad");
  if (!contractReady()) return say("verifyMsg", "Set CONTRACT_ADDRESS in static/app.js first (deploy via Remix).", "bad");
  try {
    say("verifyMsg", "Calculating fingerprint and checking the blockchain…");
    const hash = await sha256Browser(file);
    const provider = new ethers.JsonRpcProvider(PUBLIC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const [exists, registrant, ts] = await contract.verifyDocument("0x" + hash);
    if (exists) {
      say("verifyMsg", `Match found. This exact file was registered by ${registrant} on ${new Date(Number(ts) * 1000).toLocaleString()}. (This does not prove who the real-world issuer is.)`, "ok");
    } else {
      say("verifyMsg", "No match. This exact file fingerprint is not registered (the file may have been changed).", "warn");
    }
  } catch (e) { say("verifyMsg", "Verification failed: " + (e.shortMessage || e.message), "bad"); }
};
