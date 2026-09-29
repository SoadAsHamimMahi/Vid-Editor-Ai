import sys
import os

sys.path.append(os.path.abspath("scripts"))
from generate_messi_deep_sleep_master import RAW_SCENES, parse_scene_to_units, naturalize_text

print(f"Total scenes defined: {len(RAW_SCENES)}")
total_units = 0
total_words = 0

for s in RAW_SCENES:
    units = parse_scene_to_units(s["text"])
    total_units += len(units)
    words = sum(len(u[0].split()) for u in units)
    total_words += words
    print(f"Scene {s['num']:02d}: \"{s['title']}\" -> {len(units)} units, {words} words")
    # Show first unit
    if units:
        print(f"   First unit: '{units[0][0][:60]}...' (pause: {units[0][1]}s, cfg: {units[0][2]}, spd: {units[0][3]})")

print(f"\nTotal voice units: {total_units}")
print(f"Total words: {total_words}")
