from transformers import pipeline
import soundfile as sf
import librosa

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)
filepath = r'projects_data/audio/voiceover_1789739384385_broadcast_studio.mp3'
data, sr = sf.read(filepath)
if sr != 16000:
    data = librosa.resample(data, orig_sr=sr, target_sr=16000)

res = pipe({'raw': data, 'sampling_rate': 16000})
print(f"Total chunks transcribed: {len(res['chunks'])}")
with open('projects_data/audio/voiceover_1789739384385_transcript.txt', 'w', encoding='utf-8') as f:
    for c in res['chunks']:
        line = f"[{c['timestamp'][0]:.1f}s - {c['timestamp'][1]:.1f}s] {c['text'].strip()}"
        f.write(line + '\n')
        print(line)
