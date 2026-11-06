# BlockVerify AI
**AI-Assisted Document Verification Using Blockchain**

A college-project starter application demonstrating preliminary document checks, SHA-256 fingerprinting, and an Ethereum smart-contract registry.

## Features
- Responsive web dashboard
- Upload PDF, PNG, JPG or JPEG documents
- Preliminary explainable checks
- SHA-256 fingerprint generation
- Solidity contract to register and verify fingerprints
- MetaMask + Ethereum Sepolia integration
- Browser-side hash calculation during verification

## Important project limitations
The included local analysis is a transparent rule-based starter, not a trained AI model and not proof of authenticity. It checks file format, file size and filename indicators. The UI deliberately labels it as preliminary analysis. A genuine AI/OCR layer can be added later using a provider API and appropriate privacy controls. A matching blockchain hash proves that the exact file bytes match a previously registered fingerprint; it does not prove the real-world identity or authority of the person who registered it.

## Requirements
- Python 3.10+
- MetaMask browser extension
- Sepolia test ETH for transaction fees
- Remix IDE (https://remix.ethereum.org)

## Run locally (Mac)
1. Extract the ZIP.
2. Open Terminal and move into the project folder:
   ```bash
   cd ~/Downloads/BlockVerify-AI
   ```
3. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Start the website:
   ```bash
   python app.py
   ```
6. Open http://127.0.0.1:5000

You can test upload and SHA-256 analysis immediately. Blockchain actions require the contract deployment steps below.

## Deploy the smart contract using Remix
1. Open https://remix.ethereum.org.
2. Create `DocumentRegistry.sol` and paste the code from `contracts/DocumentRegistry.sol`.
3. Compile with Solidity compiler version 0.8.20 or compatible 0.8.x.
4. In MetaMask, select **Sepolia** and connect to Remix.
5. In Remix, choose **Injected Provider - MetaMask** under Deploy & Run.
6. Click **Deploy** and confirm the transaction in MetaMask.
7. Copy the deployed contract address.
8. Open `static/app.js` and set:
   ```js
   const CONTRACT_ADDRESS = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
   ```
9. Refresh the BlockVerify AI website and connect MetaMask on Sepolia.

## Demo flow for teacher
1. Upload a sample PDF or image and show the preliminary report.
2. Copy/show its SHA-256 fingerprint.
3. Connect MetaMask on Sepolia and register the fingerprint.
4. Wait for the transaction confirmation.
5. Select the same file in Verify; the app should find the fingerprint.
6. Make a copy of the file and change its contents; verify the changed file. Its fingerprint should not match.

## Safety
- Use sample documents only. Do not upload sensitive personal documents.
- Never put a wallet seed phrase or private key in this project.
- Never commit API keys or `.env` files to GitHub.
- The Flask development server is for local demonstration only, not production deployment.


## Deploy on Render

This repository's project files are inside the `BlockVerify-AI` folder. When creating
the Render Web Service, set:

- **Root Directory:** `BlockVerify-AI`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn app:app`

The included `runtime.txt` selects Python 3.12, and `Procfile` documents the
Gunicorn web process. After pushing changes to GitHub, use **Manual Deploy →
Deploy latest commit** in Render.

