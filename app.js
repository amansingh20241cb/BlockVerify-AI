// Add your deployed Sepolia contract address after deployment.
const CONTRACT_ADDRESS = ""; // Example: "0x..."
const CONTRACT_ABI = [
  "function registerDocument(bytes32 documentHash) external",
  "function verifyDocument(bytes32 documentHash) external view returns (bool,address,uint256)",
  "event DocumentRegistered(bytes32 indexed documentHash,address indexed issuer,uint256 timestamp)"
];

let latestHash = null;
let provider = null;
let signer = null;
let contract = null;

const $ = (id) => document.getElementById(id);
const input = $("documentInput");
input.addEventListener("change", () => $("fileName").textContent = input.files[0]?.name || "No file selected");

$("connectWallet").addEventListener("click", connectWallet);
$("uploadForm").addEventListener("submit", analyzeDocument);
$("registerBtn").addEventListener("click", registerHash);
$("copyHash").addEventListener("click", async () => {
  if (latestHash) { await navigator.clipboard.writeText(latestHash); $("copyHash").textContent = "Copied"; }
});
$("verifyBtn").addEventListener("click", verifyUploaded);

async function connectWallet() {
  if (!window.ethereum) { alert("MetaMask not found. Install the MetaMask browser extension first."); return; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const short = (await signer.getAddress()).slice(0,6) + "..." + (await signer.getAddress()).slice(-4);
    $("networkStatus").textContent = `${short} · Chain ${network.chainId}`;
    $("connectWallet").textContent = "Wallet connected";
    if (Number(network.chainId) !== 11155111) {
      $("registerHint").textContent = "Please switch MetaMask to Ethereum Sepolia testnet (Chain ID 11155111).";
    } else if (!CONTRACT_ADDRESS) {
      $("registerHint").textContent = "Wallet connected. Deploy the contract and add its address in static/app.js.";
    } else {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      $("registerHint").textContent = "Connected to Sepolia. Your fingerprint is ready to register.";
      $("registerBtn").disabled = !latestHash;
    }
  } catch (e) { alert(e.shortMessage || e.message); }
}

async function analyzeDocument(event) {
  event.preventDefault();
  if (!input.files.length) { alert("Choose a document first."); return; }
  $("analyzeBtn").disabled = true;
  $("analyzeBtn").textContent = "Analyzing...";
  try {
    const data = new FormData();
    data.append("document", input.files[0]);
    const response = await fetch("/api/analyze", {method:"POST", body:data});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed");
    latestHash = "0x" + result.hash;
    renderReport(result);
  } catch (e) { alert(e.message); }
  finally { $("analyzeBtn").disabled = false; $("analyzeBtn").innerHTML = 'Analyze document <span>→</span>'; }
}

function renderReport(result) {
  $("emptyState").classList.add("hidden");
  $("report").classList.remove("hidden");
  $("score").textContent = result.analysis.score;
  $("scoreLabel").textContent = result.analysis.label;
  $("analysisStatus").textContent = "Analysis complete";
  $("analysisStatus").className = "status-pill " + (result.analysis.label === "Needs review" ? "review" : "ready");
  $("hashValue").textContent = latestHash;
  $("checks").innerHTML = result.analysis.checks.map(c => `
    <div class="check"><span class="check-icon ${c.status === "review" ? "review" : ""}">${c.status === "review" ? "!" : "✓"}</span>
    <div><strong>${escapeHtml(c.name)}</strong><p>${escapeHtml(c.detail)}</p></div></div>`).join("");
  $("txResult").classList.add("hidden");
  $("registerBtn").disabled = !(contract && latestHash);
  $("registerHint").textContent = contract ? "Ready to register on Sepolia." : "Connect MetaMask, select Sepolia, and configure the deployed contract address.";
}

async function registerHash() {
  if (!contract || !latestHash) { alert("Connect MetaMask on Sepolia and configure the contract address first."); return; }
  $("registerBtn").disabled = true;
  $("registerBtn").textContent = "Confirm transaction in MetaMask...";
  try {
    const tx = await contract.registerDocument(latestHash);
    $("txResult").classList.remove("hidden");
    $("txResult").textContent = "Transaction submitted: " + tx.hash + " · Waiting for confirmation...";
    const receipt = await tx.wait();
    $("txResult").textContent = "✓ Registered successfully. Transaction: " + receipt.hash;
  } catch (e) {
    $("txResult").classList.remove("hidden");
    $("txResult").textContent = "Transaction not completed: " + (e.shortMessage || e.message);
  } finally {
    $("registerBtn").disabled = false;
    $("registerBtn").innerHTML = 'Register fingerprint on blockchain <span>↗</span>';
  }
}

async function verifyUploaded() {
  const file = $("verifyInput").files[0];
  if (!file) { alert("Choose the document you want to verify."); return; }
  if (!contract) { alert("Connect MetaMask on Sepolia and configure the contract address first."); return; }
  const button = $("verifyBtn"); button.disabled = true; button.textContent = "Checking...";
  try {
    // Compute SHA-256 locally in the browser; the file is not uploaded for verification.
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = "0x" + [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
    const [exists, issuer, timestamp] = await contract.verifyDocument(hash);
    const box = $("verifyResult"); box.classList.remove("hidden");
    if (exists) {
      box.innerHTML = `<strong style="color:#64ddb0">✓ Exact fingerprint found on blockchain</strong><br>Issuer wallet: ${escapeHtml(issuer)}<br>Registered: ${new Date(Number(timestamp)*1000).toLocaleString()}<br><span style="color:#91a1bb">This confirms a matching hash was registered; it does not independently prove the issuer's real-world identity.</span>`;
    } else {
      box.innerHTML = `<strong style="color:#ffca80">! Fingerprint not found</strong><br>This exact file fingerprint is not registered in the configured contract. The file may be different, modified, or simply not registered.`;
    }
  } catch (e) { alert(e.shortMessage || e.message); }
  finally { button.disabled = false; button.textContent = "Verify on blockchain →"; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
