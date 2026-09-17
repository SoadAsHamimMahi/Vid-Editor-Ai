import json
import asyncio
import sys
import os
import re
import edge_tts

async def main():
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            sys.stderr.write("No payload provided via stdin or argument.\n")
            sys.exit(1)
        data = json.loads(raw)

    text = data["text"]
    voice = data.get("voice", "en-US-BrianNeural")
    rate = data.get("rate", "+0%")
    pitch = data.get("pitch", "+0Hz")
    volume = data.get("volume", "+0%")
    if not re.match(r"^[+-]\d+%$", volume):
        volume = "+0%"
    output_path = data["output"]

    # Ensure parent directory exists
    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    c = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        volume=volume
    )

    # Unescape break tags inside c.texts so Microsoft Edge Speech natively executes authentic pauses
    new_texts = []
    for b in c.texts:
        s = b.decode("utf-8")
        s = re.sub(r'&lt;break\s+time=(?:&quot;|&#x27;|&apos;|[\'"])([\d.]+(?:s|ms))(?:&quot;|&#x27;|&apos;|[\'"])\s*/?&gt;', r'<break time="\1"/>', s, flags=re.IGNORECASE)
        new_texts.append(s.encode("utf-8"))
    c.texts = new_texts

    await c.save(output_path)
    print("DONE")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        sys.exit(1)
