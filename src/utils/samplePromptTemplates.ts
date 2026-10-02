/**
 * Standard Image Generation Prompts Template & Samples
 * 
 * Formatted with millisecond-precision timecodes (#M-SS.mmm)
 * and multi-field cinematic structure (SCENE, CHARACTER, ENVIRONMENT, LIGHTING, CAMERA, MOOD)
 * fully supported by the Video Generation Tool parser, timeline sequencer, and Google Flow.
 */

export const STANDARD_SAMPLE_IMAGE_PROMPTS = `#0-00.000 SCENE: Master inventor Elisha Otis standing on an open elevated platform forty feet in the air, gesturing calmly to an astonished Victorian exhibition audience.
CHARACTER: Elisha Otis (age 42, charcoal wool vest, white collar shirt with rolled sleeves, confident composed expression).
ENVIRONMENT: 1854 New York Crystal Palace exhibition hall, towering vaulted iron lattice framework, glass greenhouse dome, suspended banners, packed audience in top hats below.
LIGHTING: Natural volumetric sunlight beams streaming through high glass panes, dramatic atmospheric dust particles, warm chiaroscuro highlights.
CAMERA: Cinematic low-angle wide shot looking up at the high suspended platform, 35mm lens, sharp subject isolation, 16:9 widescreen composition.
MOOD: Dramatic suspense, industrial ambition, historical breakthrough.

#0-03.800 SCENE: The inventor's assistant raises a heavy iron cutting axe above his shoulder, poised directly over the thick primary hoisting rope.
CHARACTER: Assistant craftsman (late 20s, linen work shirt, brown leather apron, intense focused gaze).
ENVIRONMENT: Wooden scaffolding platform beside vertical guide rails, heavy hemp rope under extreme tension, iron hoist pulleys.
LIGHTING: Hard directional daylight casting crisp defined shadows, glint of metallic reflection along the sharpened axe blade.
CAMERA: Medium profile shot, dynamic action angle, shallow depth of field with softly blurred crowd in background, 16:9 framing.
MOOD: Breath-holding anticipation, imminent danger, mechanical precision.

#0-07.500 SCENE: The heavy axe cleanly slices through the tensioned hoist rope with explosive hemp fibers and dust bursting outward into the air.
CHARACTER: Assistant craftsman in full swing follow-through, eyes fixed on the severed cable ends.
ENVIRONMENT: Elevator hoisting rig, severed rope ends recoiling violently, dust motes caught in mid-air.
LIGHTING: High-speed rim lighting catching the burst of airborne fiber particles, cinematic freeze-frame effect.
CAMERA: Macro close-up action shot capturing the exact microsecond of rope severance, 50mm cinematic prime lens, 16:9 framing.
MOOD: Sudden shock, peak kinetic impact, instantaneous tension.

#0-11.250 SCENE: The heavy wagon-spring safety brake instantly snaps outward, locking deep into the notched ratchet teeth of the guide rails and arresting the elevator cab.
CHARACTER: Elisha Otis standing perfectly upright and unfazed on the safely halted platform, smiling calmly.
ENVIRONMENT: Victorian crystal palace interior, steel pawls securely clamped into vertical iron guide tracks, gasping spectators in the galleries.
LIGHTING: Golden afternoon illumination bathing the platform, warm celebratory atmosphere, settling dust particles.
CAMERA: Cinematic medium shot smoothly orbiting around the locked safety pawl mechanism to reveal Otis standing unharmed, 16:9 widescreen.
MOOD: Triumphant vindication, mechanical genius, revolutionary engineering milestone.

#0-15.600 SCENE: Elisha Otis removes his black top hat and bows to the erupting, cheering crowd as newspaper reporters frantically scribble in their notepads.
CHARACTER: Elisha Otis (waving top hat, dignified smile), surrounded by astonished Victorian spectators and journalists.
ENVIRONMENT: Crystal Palace exhibition floor, sea of waving hands, Victorian top hats, banners fluttering, brass instruments in background.
LIGHTING: Broad golden exhibition hall lighting, warm lens flare, rich cinematic color grading.
CAMERA: Wide sweeping crane shot pulling back from the inventor to encompass the celebrating hall, 24mm anamorphic lens, 16:9 aspect ratio.
MOOD: Historic celebration, birth of modern skyscrapers, monumental human achievement.`;

export const STANDARD_PROMPT_STRUCTURE_GUIDE = `You are a Lead AI Film Director & Cinematographer.
Convert the following narration script into sequenced, photorealistic image generation prompts compatible with our video software.

CRITICAL TIMECODE & STRUCTURE RULES:
1. Every scene MUST begin with a millisecond timecode: #M-SS.mmm (e.g. #0-00.000, #0-03.800, #0-07.500).
2. Follow this exact standard multi-field structure for every scene:

#M-SS.mmm SCENE: [Detailed visual action and subject description]
CHARACTER: [Consistent appearance, age, attire, expressions across scenes]
ENVIRONMENT: [Specific historical or cinematic setting, architecture, background elements]
LIGHTING: [Volumetric light, gaslight, chiaroscuro, natural sunlight, color temperature]
CAMERA: [Shot framing (wide/medium/close), angle, lens specification, depth of field]
MOOD: [Emotional atmosphere, tension, kinetic energy]

3. Maintain continuous chronological timestamps without gaps or overlaps.
4. Style: 16:9 widescreen cinematic documentary, photorealistic textures, no text, no watermarks.`;
