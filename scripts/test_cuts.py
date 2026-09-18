from transformers import pipeline
import soundfile as sf
import librosa

pipe = pipeline('automatic-speech-recognition', model='openai/whisper-tiny.en', device=0)
data, sr = sf.read('projects_data/voices/samples/carrier_essay_ref_orig_10s.wav')

for end_s in [7.1, 7.2, 7.3, 7.4]:
    cut = data[:int(end_s * sr)]
    cut_16k = librosa.resample(cut, orig_sr=sr, target_sr=16000)
    res = pipe({'raw': cut_16k, 'sampling_rate': 16000})
    print(end_s, 's -->', repr(res['text']))
