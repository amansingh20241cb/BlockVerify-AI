from google import genai
import os, hashlib, re, json, uuid
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv
    load_dotenv(
        os.path.join(os.path.dirname(__file__), ".env"),
        override=True
    )
except ImportError:
    pass


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
UPLOAD_FOLDER = os.path.join(app.root_path, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED = {"pdf", "png", "jpg", "jpeg"}

# ---------------------------------------------------------------- chatbot config
CHATBOT_NAME = os.environ.get("CHATBOT_NAME", "Nova")
# Extra spellings the speech recogniser might produce for the wake word
CHATBOT_ALIASES = [a.strip().lower() for a in os.environ.get("CHATBOT_ALIASES", "nova,nover").split(",") if a.strip()]
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

SYSTEM_PROMPT = f"""You are {CHATBOT_NAME}, the assistant inside BlockVerify, a college project
for document integrity checks with a blockchain registry.

About the project:
- Users upload a PDF/PNG/JPG/JPEG (max 10 MB). Flask computes a SHA-256 fingerprint and runs preliminary
  rule-based checks (file readable, format, size, sample/template words in filename).
- The hash can be registered on an Ethereum Sepolia smart contract (BlockVerifyRegistry.registerDocument) via MetaMask.
- Later, the browser recalculates the hash and calls verifyDocument(hash). A match means the exact file bytes
  were registered; it does NOT prove who the issuer is or that the document is genuine in the real world.
- The local analysis is rule-based; it is not a trained model and not fraud detection.

Rules: answer any question the user asks (general knowledge, coding, blockchain, studies, etc.) clearly and
briefly (under 120 words unless asked for more), in simple English. Because answers may be read aloud, avoid
tables and long lists. Never claim a document is authentic or fake. Never ask for private keys or seed phrases;
if the user mentions one, warn them to never share it."""


# ---------------------------------------------------------------- document logic (unchanged)
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def analyze_document(filename, ext, size):
    """
    Preliminary document checks using explainable local rules.
    This is NOT proof of authenticity or fraud detection.
    """
    checks = []
    if size > 0:
        checks.append({"name": "File received", "status": "pass", "detail": "The uploaded file is readable by the application."})
    if ext in {"pdf", "png", "jpg", "jpeg"}:
        checks.append({"name": "Supported format", "status": "pass", "detail": f".{ext.upper()} is an accepted format."})
    if size < 15_000:
        checks.append({"name": "File size", "status": "review", "detail": "The file is unusually small; check that the full document was uploaded."})
    else:
        checks.append({"name": "File size", "status": "pass", "detail": "File size is within the expected upload range."})
    suspicious_terms = ["sample", "dummy", "template", "specimen"]
    matched = [term for term in suspicious_terms if term in filename.lower()]
    if matched:
        checks.append({"name": "Filename review", "status": "review", "detail": "Filename contains a sample/template indicator: " + ", ".join(matched)})
    else:
        checks.append({"name": "Filename review", "status": "pass", "detail": "No common sample/template indicator found in the filename."})
    review_count = sum(c["status"] == "review" for c in checks)
    score = max(50, 98 - review_count * 15)
    return {
        "score": score,
        "label": "Needs review" if review_count else "Initial checks passed",
        "summary": "Automated preliminary checks only. A passing result does not prove that the issuer created this document.",
        "checks": checks,
        "analyzed_at": datetime.now(timezone.utc).isoformat()
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    if "document" not in request.files:
        return jsonify({"error": "Please choose a document."}), 400
    f = request.files["document"]
    if not f.filename:
        return jsonify({"error": "Please choose a document."}), 400
    original = secure_filename(f.filename)
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED:
        return jsonify({"error": "Only PDF, PNG, JPG and JPEG files are supported."}), 400
    saved = os.path.join(UPLOAD_FOLDER, uuid.uuid4().hex + "." + ext)
    f.save(saved)
    digest = sha256_file(saved)
    size = os.path.getsize(saved)
    result = analyze_document(original, ext, size)
    os.remove(saved)  # file is deleted after hashing
    return jsonify({"filename": original, "hash": digest, "size": size, "analysis": result})


# ---------------------------------------------------------------- chatbot
KNOWLEDGE = [
    (["sha", "hash", "fingerprint"],
     "A SHA-256 fingerprint is a 64-character code calculated from the exact bytes of your file. Change even one byte and the fingerprint changes completely. That is why we store the fingerprint on the blockchain instead of the file itself."),
    (["blockchain", "ethereum", "sepolia", "smart contract", "contract"],
     "BlockVerify stores your document's fingerprint, the wallet address and a timestamp in a smart contract on the Ethereum Sepolia test network. Records on a blockchain can't be silently edited, so they work as a tamper-proof registry."),
    (["metamask", "wallet"],
     "MetaMask is the browser wallet used to sign the registration transaction. Switch it to the Sepolia network and make sure you have some free Sepolia test ETH for fees. Never share your seed phrase or private key with anyone."),
    (["register"],
     "To register: upload a document, wait for the SHA-256 fingerprint, connect MetaMask on Sepolia, then click register and confirm the transaction. Wait for confirmation and the fingerprint is stored on-chain."),
    (["verify", "verification", "match"],
     "To verify, select the same file again. The browser recalculates its fingerprint and checks the contract. If it matches, that exact file was registered earlier. If not, the file was changed or never registered."),
    (["score", "analysis", "check", "fake", "fraud", "genuine", "authentic"],
     "The current analysis is a transparent rule-based starter: it checks the format, file size and filename hints. It is not a trained model and cannot prove a document is genuine or fake. A blockchain match only proves the exact bytes were registered by someone."),
    (["privacy", "safe", "secure", "delete", "store"],
     "Your uploaded file is deleted from the server right after hashing. Only the fingerprint and report stay in your browser. Still, use sample documents only for this project."),
    (["format", "size", "upload", "pdf", "png", "jpg"],
     "You can upload PDF, PNG, JPG or JPEG files up to 10 megabytes."),
    (["run", "start", "install", "setup"],
     "Create a virtual environment, run pip install -r requirements.txt, then python app.py and open http://127.0.0.1:5000. Deploy the contract through Remix to use the blockchain features."),
    (["hello", "hi", "hey", "who are you", "your name", "what can you do", "help"],
     f"I'm {CHATBOT_NAME}, the BlockVerify assistant. Ask me about hashing, blockchain, MetaMask, how to register or verify a document, or explain your report. With a Gemini key connected, I can answer general questions too."),
]


def format_context(ctx):
    """Turn the last document report (sent by the browser) into plain text for the model."""
    if not isinstance(ctx, dict):
        return ""
    a = ctx.get("analysis") or {}
    checks = "; ".join(
        f"{str(c.get('name'))[:40]}={str(c.get('status'))[:10]}"
        for c in (a.get("checks") or [])[:8] if isinstance(c, dict)
    )
    return (f"\n\nLatest document in the app: file={str(ctx.get('filename',''))[:80]}, "
            f"size={str(ctx.get('size',''))[:12]} bytes, sha256={str(ctx.get('hash',''))[:64]}, "
            f"score={str(a.get('score',''))[:5]}, result={str(a.get('label',''))[:40]}, checks: {checks}")


def local_answer(message, ctx):
    m = message.lower()
    a = (ctx or {}).get("analysis") if isinstance(ctx, dict) else None
    if a and any(w in m for w in ["my report", "my document", "my file", "my score", "my hash", "this document", "this file", "explain the report", "result"]):
        flagged = [str(c.get("name")) for c in a.get("checks", []) if isinstance(c, dict) and c.get("status") == "review"]
        txt = f"Your file {ctx.get('filename','')} scored {a.get('score')} out of 100: {a.get('label')}. "
        txt += ("These checks need review: " + ", ".join(flagged) + ". ") if flagged else "All preliminary checks passed. "
        return txt + "Remember, this is only a preliminary check and does not prove authenticity."
    for words, answer in KNOWLEDGE:
        if any(re.search(r"\b" + re.escape(w), m) for w in words):
            return answer
    return ("I can answer BlockVerify questions offline, but for general questions I need a Gemini API key. "
            "Add GEMINI_API_KEY to your .env file and restart the server, then ask me anything.")







def gemini_answer(message, history, ctx):
    """Generate Nova's response using Gemini."""

    client = genai.Client(api_key=GEMINI_API_KEY)

    prompt = SYSTEM_PROMPT + format_context(ctx) + "\n\n"

    for h in history[-4:]:
        role = "User" if h["role"] == "user" else CHATBOT_NAME
        prompt += f"{role}: {h['content'][:1000]}\n"

    prompt += f"User: {message}\n{CHATBOT_NAME}:"

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt
    )

    reply = (response.text or "").strip()

    if not reply:
        raise Exception("Gemini returned an empty response.")

    return reply


@app.route("/api/chat/config")
def chat_config():
    return jsonify({
        "name": CHATBOT_NAME,
        "aliases": CHATBOT_ALIASES,
        "ai_enabled": bool(GEMINI_API_KEY)
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()[:1000]

    if not message:
        return jsonify({"error": "Please say or type something."}), 400

    history = []

    for h in (data.get("history") or [])[-10:]:
        if (
            isinstance(h, dict)
            and h.get("role") in ("user", "assistant")
            and isinstance(h.get("content"), str)
        ):
            history.append({
                "role": h["role"],
                "content": h["content"][:1000]
            })

    ctx = data.get("context")

    if GEMINI_API_KEY:
        try:
            reply = gemini_answer(message, history, ctx)

            if reply:
                return jsonify({
                    "reply": reply,
                    "mode": "gemini"
                })

        except Exception:
            app.logger.exception("GEMINI ERROR")

    return jsonify({
        "reply": local_answer(message, ctx),
        "mode": "offline"
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
