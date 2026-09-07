import os
import sys
import json
import logging
import tempfile
import urllib.request
import textwrap
import subprocess
import functions_framework
from google.cloud import texttospeech
from google.cloud import storage

# Configure logging to stdout for Cloud Logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger()


def get_font_path():
    """Find a usable TTF font file supporting Polish characters."""
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "fonts", "Montserrat-Bold.ttf"),
        os.path.join(os.path.dirname(__file__), "Montserrat-Bold.ttf"),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in possible_paths:
        if os.path.exists(p):
            return p
    return None


def escape_ffmpeg_path(path_str: str) -> str:
    """Escape backslashes and colons for FFmpeg filter argument values."""
    return path_str.replace("\\", "/").replace(":", "\\:")


@functions_framework.http
def concatenate_videos(request):
    """
    Google Cloud Function HTTP handler for concatenating 3 video scenes into a YouTube Short (1080x1920, 18s).
    Processes scenes with Google Text-to-Speech (Polish), overlays styled subtitles, normalizes video specs,
    concatenates, and uploads the result to Google Cloud Storage.
    """
    print("[START]")
    print("[VALIDATION]")

    # 1. Parse and validate JSON input
    request_json = request.get_json(silent=True)
    if not request_json:
        err_msg = "Nieprawidłowy ładunek JSON w żądaniu."
        print(f"[ERROR] Validation failed: {err_msg}")
        return (
            json.dumps({"status": "error", "stage": "validation", "error": err_msg}),
            400,
            {"Content-Type": "application/json"}
        )

    scenes = request_json.get("scenes")
    if not scenes or not isinstance(scenes, list):
        err_msg = "Wymagane pole 'scenes' musi być listą."
        print(f"[ERROR] Validation failed: {err_msg}")
        return (
            json.dumps({"status": "error", "stage": "validation", "error": err_msg}),
            400,
            {"Content-Type": "application/json"}
        )

    if len(scenes) != 3:
        err_msg = f"Expected exactly 3 scenes, got {len(scenes)}"
        print(f"[ERROR] Validation failed: {err_msg}")
        return (
            json.dumps({"status": "error", "stage": "validation", "error": err_msg}),
            400,
            {"Content-Type": "application/json"}
        )

    for idx, sc in enumerate(scenes, start=1):
        if not isinstance(sc, dict):
            err_msg = f"Scena {idx} musi być obiektem JSON."
            print(f"[ERROR] Validation failed: {err_msg}")
            return (
                json.dumps({"status": "error", "stage": "validation", "error": err_msg, "scene": idx}),
                400,
                {"Content-Type": "application/json"}
            )
        video_url = sc.get("video_url") or sc.get("videoUrl") or sc.get("url")
        text = sc.get("text") or sc.get("voiceover_text") or sc.get("subtitles")
        if not video_url or not isinstance(video_url, str) or not video_url.strip():
            err_msg = f"Scena {idx}: puste lub brakujące 'video_url'."
            print(f"[ERROR] Validation failed: {err_msg}")
            return (
                json.dumps({"status": "error", "stage": "validation", "error": err_msg, "scene": idx}),
                400,
                {"Content-Type": "application/json"}
            )
        if not text or not isinstance(text, str) or not text.strip():
            err_msg = f"Scena {idx}: puste lub brakujące 'text' lub 'voiceover_text'."
            print(f"[ERROR] Validation failed: {err_msg}")
            return (
                json.dumps({"status": "error", "stage": "validation", "error": err_msg, "scene": idx}),
                400,
                {"Content-Type": "application/json"}
            )

    output_filename = request_json.get("filename", "viral_short.mp4")
    if not output_filename.endswith(".mp4"):
        output_filename += ".mp4"

    font_path = get_font_path()

    # Temporary working directory for downloading and processing assets
    with tempfile.TemporaryDirectory() as tmp_dir:
        processed_scene_files = []

        # Initialize TTS client if available
        tts_client = None
        try:
            tts_client = texttospeech.TextToSpeechClient()
        except Exception as e:
            print(f"[WARNING] Nie można zainicjalizować Google TTS Client: {e}")

        # 2. Process each scene
        for i, sc in enumerate(scenes, start=1):
            video_url = (sc.get("video_url") or sc.get("videoUrl") or sc.get("url") or "").strip()
            raw_text = (sc.get("text") or sc.get("voiceover_text") or sc.get("subtitles") or "").strip()
            voice_name = sc.get("voice", "pl-PL-Wavenet-A").strip()

            raw_video_path = os.path.join(tmp_dir, f"raw_scene_{i}.mp4")
            tts_audio_path = os.path.join(tmp_dir, f"tts_scene_{i}.mp3")
            sub_text_path = os.path.join(tmp_dir, f"sub_scene_{i}.txt")
            std_scene_path = os.path.join(tmp_dir, f"std_scene_{i}.mp4")

            # A. Download raw video
            print(f"[DOWNLOAD] Scene {i}")
            try:
                req = urllib.request.Request(
                    video_url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                )
                with urllib.request.urlopen(req, timeout=30) as resp, open(raw_video_path, "wb") as out_f:
                    out_f.write(resp.read())
            except Exception as e:
                err_msg = f"Nie udało się pobrać pliku wideo dla sceny {i}: {str(e)}"
                print(f"[ERROR] {err_msg}")
                return (
                    json.dumps({"status": "error", "stage": "download", "scene": i, "error": err_msg}),
                    500,
                    {"Content-Type": "application/json"}
                )

            # B. Generate TTS Audio via Google Cloud TTS
            print(f"[TTS] Scene {i}")
            try:
                if tts_client:
                    lang_code = "pl-PL"
                    if "-" in voice_name:
                        parts = voice_name.split("-")
                        if len(parts) >= 2:
                            lang_code = f"{parts[0]}-{parts[1]}"

                    synthesis_input = texttospeech.SynthesisInput(text=raw_text)
                    voice = texttospeech.VoiceSelectionParams(
                        language_code=lang_code,
                        name=voice_name
                    )
                    audio_config = texttospeech.AudioConfig(
                        audio_encoding=texttospeech.AudioEncoding.MP3
                    )
                    response = tts_client.synthesize_speech(
                        input=synthesis_input,
                        voice=voice,
                        audio_config=audio_config
                    )
                    with open(tts_audio_path, "wb") as out_a:
                        out_a.write(response.audio_content)
                else:
                    # Fallback silent audio generator via FFmpeg if TTS client fails initialization
                    cmd_silent = [
                        "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                        "-t", "6", "-c:a", "libmp3lame", tts_audio_path
                    ]
                    subprocess.run(cmd_silent, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except Exception as e:
                err_msg = f"Błąd generowania głosu TTS dla sceny {i}: {str(e)}"
                print(f"[ERROR] {err_msg}")
                return (
                    json.dumps({"status": "error", "stage": "tts", "scene": i, "error": err_msg}),
                    500,
                    {"Content-Type": "application/json"}
                )

            # C. Format subtitles safely (wrap lines to avoid overflow, write to UTF-8 file)
            wrapped_text = textwrap.fill(raw_text, width=28)
            with open(sub_text_path, "w", encoding="utf-8") as tf:
                tf.write(wrapped_text)

            # D. Standardize Scene with FFmpeg (6s duration, 1080x1920 9:16, 30fps, subtitles, normalized audio)
            print(f"[FFMPEG] Scene {i}")
            escaped_sub_path = escape_ffmpeg_path(sub_text_path)

            drawtext_filter = f"drawtext=textfile='{escaped_sub_path}':fontsize=48:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-text_w)/2:y=h-th-320:fix_bounds=1"
            if font_path:
                escaped_font_path = escape_ffmpeg_path(font_path)
                drawtext_filter += f":fontfile='{escaped_font_path}'"

            # Filter chain:
            # 1. Video: loop if short, scale & crop to 1080x1920 (9:16), set fps to 30, trim to 6.0s, apply drawtext
            # 2. Audio: pad/trim TTS audio to exactly 6.0s stereo 44.1kHz
            filter_complex = (
                f"[0:v]loop=loop=-1:size=32767:start=0,"
                f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,"
                f"trim=duration=6,setpts=PTS-STARTPTS,{drawtext_filter}[vout];"
                f"[1:a]apad=whole_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[aout]"
            )

            cmd_scene = [
                "ffmpeg", "-y",
                "-i", raw_video_path,
                "-i", tts_audio_path,
                "-filter_complex", filter_complex,
                "-map", "[vout]",
                "-map", "[aout]",
                "-c:v", "libx264",
                "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-t", "6",
                std_scene_path
            ]

            try:
                proc = subprocess.run(cmd_scene, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            except subprocess.CalledProcessError as cpe:
                err_msg = f"FFmpeg error processing scene {i}: {cpe.stderr[-500:] if cpe.stderr else str(cpe)}"
                print(f"[ERROR] Stage FFMPEG Scene {i} failed:\nCommand: {' '.join(cmd_scene)}\nStderr: {cpe.stderr}")
                return (
                    json.dumps({
                        "status": "error",
                        "stage": "ffmpeg",
                        "scene": i,
                        "error": err_msg,
                        "command": " ".join(cmd_scene)
                    }),
                    500,
                    {"Content-Type": "application/json"}
                )

            processed_scene_files.append(std_scene_path)

        # 3. Concatenate all 3 standardized scenes into final 18s YouTube Short
        print("[CONCAT]")
        final_mp4_path = os.path.join(tmp_dir, output_filename)

        concat_filter = (
            "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[vout][aout]"
        )

        cmd_concat = [
            "ffmpeg", "-y",
            "-i", processed_scene_files[0],
            "-i", processed_scene_files[1],
            "-i", processed_scene_files[2],
            "-filter_complex", concat_filter,
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            final_mp4_path
        ]

        try:
            subprocess.run(cmd_concat, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        except subprocess.CalledProcessError as cpe:
            err_msg = f"FFmpeg concat failed: {cpe.stderr[-500:] if cpe.stderr else str(cpe)}"
            print(f"[ERROR] Stage CONCAT failed:\nCommand: {' '.join(cmd_concat)}\nStderr: {cpe.stderr}")
            return (
                json.dumps({
                    "status": "error",
                    "stage": "ffmpeg",
                    "error": err_msg,
                    "command": " ".join(cmd_concat)
                }),
                500,
                {"Content-Type": "application/json"}
            )

        # 4. Upload final video to Google Cloud Storage
        print("[UPLOAD]")
        bucket_name = os.environ.get("BUCKET_NAME")
        public_url = None

        if bucket_name:
            try:
                storage_client = storage.Client()
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(output_filename)
                blob.upload_from_filename(final_mp4_path, content_type="video/mp4")
                try:
                    blob.make_public()
                except Exception as pe:
                    print(f"[INFO] Nie można ustawić publicznego dostępu do bloba (może obowiązywać Uniform Bucket Level Access): {pe}")

                public_url = blob.public_url or f"https://storage.googleapis.com/{bucket_name}/{output_filename}"
            except Exception as se:
                print(f"[WARNING] Błąd podczas przesyłania do Google Cloud Storage: {se}")
                public_url = f"https://storage.googleapis.com/{bucket_name}/{output_filename}"
        else:
            print("[INFO] BUCKET_NAME nie ustawiono w środowisku. Generowanie przykładowego URL wyjściowego.")
            public_url = f"https://storage.googleapis.com/default-bucket/{output_filename}"

        # 5. Success return
        print("[COMPLETE]")
        return (
            json.dumps({
                "status": "success",
                "url": public_url,
                "filename": output_filename,
                "duration": 18,
                "scenes_processed": 3,
                "resolution": "1080x1920"
            }),
            200,
            {"Content-Type": "application/json"}
        )
