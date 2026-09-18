from transformers import pipeline
import soundfile as sf
import librosa

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0, return_timestamps=True)
data, sr = sf.read('projects_data/voices/samples/carrier_essay_ref_orig_10s.wav')
if sr != 16000:
    data = librosa.resample(data, orig_sr=sr, target_sr=16000)
res = pipe({'raw': data, 'sampling_rate': 16000})

print('Full transcription with timestamps:')
for chunk in res['chunks']:
    print(chunk['timestamp'], '-->', repr(chunk['text']))
