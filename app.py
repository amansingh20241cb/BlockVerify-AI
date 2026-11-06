import os, hashlib, re, json
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
UPLOAD_FOLDER = os.path.join(app.root_path, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED = {"pdf", "png", "jpg", "jpeg"}

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def analyze_document(filename, ext, size):
    """
    Starter AI-analysis layer.
    Uses explainable document-quality checks locally. For OCR/LLM analysis,
    configure GEMINI_API_KEY and integrate a provider in this function.
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
    # Use a random server-side filename; original document is not exposed publicly.
    import uuid
    saved = os.path.join(UPLOAD_FOLDER, uuid.uuid4().hex + "." + ext)
    f.save(saved)
    digest = sha256_file(saved)
    size = os.path.getsize(saved)
    result = analyze_document(original, ext, size)
    # The file itself is removed after hashing; only the hash/report remains in browser memory.
    os.remove(saved)
    return jsonify({
        "filename": original,
        "hash": digest,
        "size": size,
        "analysis": result
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
