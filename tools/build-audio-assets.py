#!/usr/bin/env python3
"""Original synthesized cues and an original eight-bar loop. Requires ffmpeg for Ogg."""
import array
import json
import math
import random
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'audio'
RATE = 44100
TAU = 2 * math.pi
rng = random.Random(20261016)
metadata = []

def frequency(midi): return 440 * 2 ** ((midi - 69) / 12)

def envelope(t, duration, attack=.003, decay=5):
    if not 0 <= t < duration: return 0
    return min(1, t/attack) * math.exp(-decay*t/duration) * min(1, (duration-t)/.01)

def tone(freq, duration, decay=5, metallic=False):
    result=[]
    for i in range(round(duration*RATE)):
        t=i/RATE
        sound=math.sin(TAU*freq*t)
        sound+=.23*math.sin(TAU*freq*(2.71 if metallic else 2)*t)
        sound+=.08*math.sin(TAU*freq*(4.13 if metallic else 3)*t)
        result.append(sound*envelope(t,duration,decay=decay))
    return result

def mix(buf, samples, when=0, gain=1):
    offset=round(when*RATE)
    for j,value in enumerate(samples):
        if j+offset<len(buf): buf[j+offset]+=gain*value

def impact(duration, freq, noise, decay):
    values=tone(freq,duration,decay=decay,metallic=True)
    for i in range(len(values)):
        t=i/RATE
        values[i]+=noise*(rng.random()*2-1)*envelope(t,duration,attack=.001,decay=15)
    return values

def write_wav(path, samples, channels=1, peak=.55):
    max_value=max(abs(x) for x in samples) or 1
    scale=peak/max_value
    ints=array.array('h',(round(max(-1,min(1,x*scale))*32767) for x in samples))
    import sys
    if sys.byteorder!='little': ints.byteswap()
    path.parent.mkdir(parents=True,exist_ok=True)
    with wave.open(str(path),'wb') as out:
        out.setnchannels(channels); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(ints.tobytes())
    rms=math.sqrt(sum((x*scale)**2 for x in samples)/len(samples))
    return dict(sampleRate=RATE,channels=channels,durationSeconds=len(samples)/(RATE*channels),peakDbFS=round(20*math.log10(peak),2),rmsDbFS=round(20*math.log10(rms),2))

def cue(name, values, role, gain=.55):
    path=OUT / 'sfx' / f'{name}.wav'
    info=write_wav(path,values,peak=gain)
    metadata.append(dict(id=name,path=f'audio/sfx/{name}.wav',group=9,role=role,format='wav',source='original procedural synthesis',**info))

# 09: short mechanical transients; brightness conveys impact strength.
cue('wall-soft',impact(.12,740,.16,7),'弱い壁衝突',.38)
cue('wall-hard',impact(.21,1070,.24,6),'強い壁衝突',.58)
values=impact(.32,frequency(83),.025,4)
mix(values,tone(frequency(90),.25,decay=5,metallic=True),.025,.4)
cue('bumper',values,'バンパーのベル',.57)
cue('flipper-up',impact(.085,240,.65,8),'フリッパーの立上り',.5)
cue('flipper-down',impact(.075,165,.42,8),'フリッパーの戻り',.38)
values=[]
duration=.56
phase=0
for i in range(round(duration*RATE)):
    t=i/RATE; phase+=TAU*(330*math.exp(-3*t)+55)/RATE
    values.append(math.sin(phase)*envelope(t,duration,attack=.005,decay=3))
cue('drain',values,'落球',.43)
for name,notes,role in [('game-start',[64,67,71,76],'開始'),('game-over',[71,67,64,52],'終了')]:
    values=[0.0]*round(.95*RATE)
    for j,note in enumerate(notes): mix(values,tone(frequency(note),.45,decay=4),j*.14,.8)
    cue(name,values,role,.46)
cue('ui-click',tone(1450,.055,decay=8),'UI決定',.25)

# 10: "Circuit Return", original 8 bars, 112 BPM, 4/4, E minor.
# Compose in a periodic buffer: decaying tails wrap, avoiding an artificial cut.
bpm=112
beat=60/bpm
frames=round(8*4*beat*RATE)
left=[0.0]*frames; right=[0.0]*frames

def music_mix(samples, when, gain, pan=0):
    start=round(when*RATE)
    l=math.sqrt((1-pan)/2)*gain; r=math.sqrt((1+pan)/2)*gain
    for j,v in enumerate(samples):
        k=(start+j)%frames
        left[k]+=v*l; right[k]+=v*r

def kick():
    duration=.24; phase=0; out=[]
    for i in range(round(duration*RATE)):
        t=i/RATE; phase+=TAU*(48+95*math.exp(-t*35))/RATE
        out.append(math.sin(phase)*envelope(t,duration,attack=.002,decay=5))
    return out

def noise_hit(duration, decay, highpass=True):
    out=[]; previous=0
    for i in range(round(duration*RATE)):
        noise=rng.random()*2-1; sample=noise-previous if highpass else noise; previous=noise
        out.append(sample*envelope(i/RATE,duration,attack=.001,decay=decay))
    return out

chords=[[52,55,59,64],[48,52,55,59],[43,47,50,55],[50,54,57,62]]*2
melody=[[76,0,71,74],[72,0,71,67],[71,0,74,79],[78,74,69,0],
        [76,79,78,76],[72,76,71,0],[71,74,79,78],[74,69,66,71]]
k=kick(); snare=noise_hit(.16,8,False); hat=noise_hit(.045,9)
for bar,chord in enumerate(chords):
    start=bar*4*beat
    for step in range(8):
        when=start+step*.5*beat
        note=chord[[0,2,1,3,0,2,1,3][step]]+12
        music_mix(tone(frequency(note),.44,decay=5),when,.065,(-.4 if step%2 else .4))
        music_mix(hat,when,.017,.25)
    for step in range(4):
        when=start+step*beat
        music_mix(tone(frequency(chord[0]-12),.38,decay=4),when,.19)
        music_mix(k,when,.3)
        if step%2: music_mix(snare,when,.045,-.1)
        if melody[bar][step]:
            voice=tone(frequency(melody[bar][step]),.72,decay=4)
            music_mix(voice,when,.078,-.1)
            music_mix(voice,when+beat*.75,.016,.4)
stereo=[v for pair in zip(left,right) for v in pair]
with tempfile.TemporaryDirectory(prefix='pinball-audio-') as directory:
    wav=Path(directory)/'circuit-return.wav'
    info=write_wav(wav,stereo,channels=2,peak=.62)
    output=OUT/'music'/'circuit-return.ogg'; output.parent.mkdir(parents=True,exist_ok=True)
    if not shutil.which('ffmpeg'): raise SystemExit('ffmpeg is required for the Ogg export.')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','5','-map_metadata','-1',str(output)],check=True)
metadata.append(dict(id='circuit-return',path='audio/music/circuit-return.ogg',group=10,role='BGM: Circuit Return',format='ogg',source='original composition and procedural synthesis',bpm=bpm,bars=8,timeSignature='4/4',key='E minor',loop=True,loopStartFrame=0,loopEndFrame=frames,loopPlayback='decoded AudioBufferSourceNode.loop=true',masterWavMetrics=info))
(ROOT/'assets'/'audio-manifest.json').write_text(json.dumps({'version':1,'assets':metadata},ensure_ascii=False,indent=2)+'\n')
print(f'Wrote 9 WAV cues and one {frames/RATE:.3f}s stereo Ogg loop.')
