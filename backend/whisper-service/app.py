
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel
import os
import tempfile

app = Flask(__name__)

print("Loading Whisper model...")
model = WhisperModel("base", device="cpu", compute_type="int8")
print("Whisper model loaded successfully.")


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "IntellMeet Whisper transcription"
    })


@app.post("/transcribe")
def transcribe():
    if "audio" not in request.files:
        return jsonify({
            "error": "Please upload an audio file using the 'audio' field."
        }), 400

    audio = request.files["audio"]

    if not audio.filename:
        return jsonify({
            "error": "No audio filename provided."
        }), 400

    suffix = os.path.splitext(audio.filename)[1] or ".webm"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as temp_file:
            audio.save(temp_file)
            temp_path = temp_file.name

        segments, info = model.transcribe(temp_path, beam_size=5)
        transcript = " ".join(
            segment.text.strip() for segment in segments
        ).strip()

        return jsonify({
            "text": transcript,
            "language": info.language,
            "language_probability": info.language_probability
        })

    except Exception as exc:
        app.logger.exception("Transcription failed")
        return jsonify({
            "error": str(exc)
        }), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)
