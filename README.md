# BlockVerify

Document integrity checks with SHA-256 fingerprints and an Ethereum Sepolia registration registry.

BlockVerify is a small Flask application built as a college project. It accepts a PDF or image, computes a SHA-256 fingerprint from the exact file bytes, runs a short list of transparent file-quality checks, and can register that fingerprint on a Solidity smart contract through MetaMask. Later, the same file can be selected again and checked against the registry.

The project also includes a voice-enabled assistant named Nova. With an optional Google key it can answer general questions; without one it answers project questions offline.

> **Scope of the checks:** The local analysis uses straightforward rules. It is not a trained model, not a fraud detector, and not proof that a document is genuine. A matching fingerprint only proves that the exact bytes were registered by some wallet.

## Contents

- [Features](#features)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [Smart contract deployment](#smart-contract-deployment)
- [Using the application](#using-the-application)
- [HTTP API](#http-api)
- [Demo walkthrough](#demo-walkthrough)
- [Privacy, security and limitations](#privacy-security-and-limitations)
- [Optional hosting setup](#optional-hosting-setup)
- [Troubleshooting](#troubleshooting)
- [Author and license](#author-and-license)

## Features

- Responsive dashboard for uploading and reviewing documents.
- Accepted formats: PDF, PNG, JPG and JPEG, up to 10 MB per file.
- SHA-256 fingerprint generated on the server during analysis and in the browser during verification.
- Preliminary checks for file readability, format, size and sample/template hints in the filename.
- Registration and verification through `BlockVerifyRegistry.sol` on the Ethereum Sepolia test network.
- MetaMask wallet connection with an automatic Sepolia network switch.
- Copy-to-clipboard fingerprint display.
- Nova assistant with text chat, speech recognition and spoken replies in Chrome or Edge.

## Project layout

```text
BlockVerify/
├── app.py                      Flask backend: routes, hashing, checks, assistant API
├── requirements.txt            Python dependencies
├── .env.example                Template for local environment variables
├── .gitignore                  Keeps local secrets and caches out of git
├── contracts/
│   └── BlockVerifyRegistry.sol Solidity registry contract
├── templates/
│   └── index.html              Dashboard markup
├── static/
│   ├── app.js                  Upload, wallet, registration and verification logic
│   ├── chatbot.js              Nova widget, speech and chat client
│   ├── chatbot.css             Widget styling
│   └── style.css               Dashboard styling
├── uploads/                    Temporary upload directory (empty in git)
│   └── .gitkeep
├── Procfile                    Optional process definition for hosted deployments
└── runtime.txt                 Optional Python version pin for hosted deployments
```

Uploaded files are written to `uploads/` only long enough to be hashed and are deleted immediately afterwards. The directory itself is kept in git with a `.gitkeep` file.

## How it works

1. **Analyze.** The browser sends the chosen file to `POST /api/analyze`. Flask validates the extension, stores it under a random name in `uploads/`, computes its SHA-256 fingerprint, runs the rule-based checks and removes the stored file.
2. **Register.** With MetaMask connected to Sepolia, the browser sends `registerDocument(hash)` to the deployed contract. The contract stores the fingerprint, the sender address and a timestamp.
3. **Verify.** The browser computes the SHA-256 fingerprint of the selected file locally, calls `verifyDocument(hash)` through a public Sepolia RPC endpoint and reports whether that exact fingerprint exists in the registry.

The document itself is never stored on-chain. Only the 32-byte fingerprint, the registering wallet address and the block timestamp are recorded.

## Requirements

- Python 3.10 or newer.
- `pip` and a virtual environment.
- Chrome or Edge for voice input (text chat works in any modern browser).
- MetaMask browser extension, configured for Sepolia, for the blockchain features.
- A small amount of free Sepolia test ETH to pay transaction fees.
- Remix IDE for deploying the contract.

## Local setup

### macOS / Linux

```bash
cd path/to/BlockVerify
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # optional: add your key to enable general answers
python app.py
```

Open <http://127.0.0.1:5000> in your browser.

### Windows

```bat
cd path\to\BlockVerify
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Then open <http://127.0.0.1:5000>.

The Flask development server runs with `debug=True` on port 5000. It is intended for local demonstrations only, not for public hosting.

## Configuration

Copy `.env.example` to `.env` and edit the values you need. The `.env` file is ignored by git and must never be committed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Optional key that enables general answers through Nova. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Model identifier used when a key is configured. |
| `CHATBOT_NAME` | `Nova` | Assistant display name and wake word. |
| `CHATBOT_ALIASES` | `nova,nover` | Extra spellings accepted by speech recognition. |

When `GEMINI_API_KEY` is empty, Nova still answers questions about hashing, the contract, MetaMask and the analysis report from a built-in offline knowledge base.

## Smart contract deployment

The Solidity source is in `contracts/BlockVerifyRegistry.sol` and compiles with Solidity 0.8.20 or a compatible 0.8.x version.

1. Open <https://remix.ethereum.org> and create a file named `BlockVerifyRegistry.sol`.
2. Paste the contents of `contracts/BlockVerifyRegistry.sol` into that file.
3. Open the Solidity compiler tab and compile with version 0.8.20 or newer within the 0.8.x line.
4. In MetaMask, select the Sepolia network.
5. In Remix, open **Deploy & Run Transactions** and choose **Injected Provider - MetaMask** as the environment.
6. Click **Deploy** and confirm the transaction in MetaMask.
7. Copy the deployed contract address.
8. Open `static/app.js` and replace the value of `CONTRACT_ADDRESS` near the top of the file with your address.
9. Refresh the browser page. The wallet and registration buttons now talk to your contract.

The address currently set in `static/app.js` is `0x5FBEAAf71Ce87Cf784802893A246c62881D70AC1`. Replace it if you deploy your own registry.

The contract exposes two functions:

| Function | Type | Description |
| --- | --- | --- |
| `registerDocument(bytes32 hash)` | transaction | Stores the fingerprint with the caller and timestamp. Rejects duplicates. |
| `verifyDocument(bytes32 hash)` | view | Returns `exists`, `registrant` and `timestamp` for a fingerprint. |

## Using the application

- **Analyze a document:** drag a file onto the drop zone or use the file picker, then click **Analyze & generate fingerprint**. The report shows the score, the individual checks and the fingerprint.
- **Register:** click **Connect wallet**, approve the account request and confirm the Sepolia network if prompted. Then click **Register fingerprint on-chain** and confirm the transaction in MetaMask.
- **Verify:** choose the same file in the verification section and click **Verify document**. A match shows the registering wallet and the registration time. A changed copy will not match.
- **Ask Nova:** open the chat bubble in the bottom-right corner. Type a question, or click the microphone button and say a wake phrase such as "Nova, what is SHA-256?". Say "stop" to put the assistant back to sleep. After an analysis, "explain my report" summarises the latest checks.

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Renders the dashboard. |
| `POST` | `/api/analyze` | Multipart form field `document`. Returns filename, hash, size and the analysis report. |
| `POST` | `/api/chat` | JSON body with `message`, optional `history` and optional `context`. Returns `reply` and `mode` (`gemini` or `offline`). |
| `GET` | `/api/chat/config` | Returns the assistant name, wake-word aliases and whether a key is configured. |

Example analysis response:

```json
{
  "filename": "sample.pdf",
  "hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "size": 20480,
  "analysis": {
    "score": 98,
    "label": "Initial checks passed",
    "summary": "Automated preliminary checks only. A passing result does not prove that the issuer created this document.",
    "checks": [],
    "analyzed_at": "2026-11-23T10:00:00+00:00"
  }
}
```

## Demo walkthrough

1. Start the server and open the dashboard.
2. Analyze a sample PDF or image and point out the report and fingerprint.
3. Connect MetaMask on Sepolia and register the fingerprint.
4. Verify the same file and show the matching registry entry.
5. Make a copy, change its contents, and verify it again to show that the fingerprint no longer matches.
6. Ask Nova to explain the report and to describe how the registry works.

## Privacy, security and limitations

- Uploaded files are deleted from the server immediately after hashing. Only the fingerprint and the report remain in the browser session.
- Use sample documents only. Do not upload personal or sensitive documents to a demo server.
- Never place a wallet seed phrase, private key or provider key in source files, `.env.example` or commit messages.
- The fingerprint proves byte-for-byte identity. It does not identify the real-world issuer, prove authorship or establish that a document is valid.
- The rule-based checks look only at format, size and filename hints. They can be passed by any file of the right shape.
- The Flask development server is not suitable for production traffic.
- Verification reads from a public Sepolia RPC endpoint, so availability depends on that service.

## Optional hosting setup

The repository retains `Procfile` and `runtime.txt` from an earlier hosted setup. `Procfile` starts the app with `gunicorn app:app`, and `runtime.txt` pins Python 3.12.10. `gunicorn` is declared in `requirements.txt`. These files are optional and are not needed for local development.

## Troubleshooting

| Symptom | Suggested fix |
| --- | --- |
| "Only PDF, PNG, JPG and JPEG files are supported" | Rename the file with a supported extension or choose a different file. |
| "MetaMask not found" | Install the MetaMask browser extension and reload the page. |
| Wallet connection fails | Unlock MetaMask, select Sepolia and try again. |
| Registration fails with "already registered" | That exact fingerprint is already in the contract; verification is the correct next step. |
| Verification says "No match" | The file bytes differ from the registered file, or the contract address is not set to your deployment. |
| Nova says a key is needed | Add `GEMINI_API_KEY` to `.env` and restart the server; offline answers still work. |
| Speech input does nothing | Use Chrome or Edge, allow microphone access, click the microphone button and say the wake word. |

## Author and license

Maintained by GitHub user `amansingh20241cb`. No blanket license file is included in this repository; the Solidity source carries an MIT SPDX identifier.
