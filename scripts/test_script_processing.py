import re

raw_script = """[narrating, low] September 1881. Washington, D.C. The President of the United States is dying inside a wooden box.

[building] Twenty feet long. Lined with sheet iron. Wrapped in a hundred and twenty hanging cotton screens, soaked in ice water. Six tons of ice hang above it, melting, dripping down through the cotton in a constant, deliberate rain. A steam-driven blower forces the outside air through that wet cotton and pumps it straight into the sickroom.

[measured] The room has exactly one job: control the one thing doctors can still control, when nothing else about the wound can be controlled at all. Bring the temperature down, and buy the President time.

[quiet, certain] It works. It drops the room twenty degrees below the swamp-heat outside. It runs, without stopping, for fifty-eight days. It does everything it was built to do.

[pause] [flat] President James Garfield dies anyway.

[weighty] That machine proved, in 1881, that manufactured cold was real — not a rumor, not a parlor trick, but something you could build, and run, and trust. [curious] So why, forty-four years later, had most Americans still never felt it once in their lives? [pause] And why is a direct descendant of that machine sitting quietly in three out of every four homes in this country right now, doing exactly what it did for a dying president — and nobody so much as glances at it?

[intriguing] The answer starts thirty years before Garfield was ever shot. With a doctor nobody believed, in a town most people have never heard of.

[narrating] Rewind to 1833. A young physician named John Gorrie takes a post in Apalachicola, Florida — a humid, mosquito-thick port town where yellow fever tears through the population every summer. Gorrie believes, correctly, that cooler air helps a fever break. The problem is simple, and it's the same problem the whole story keeps circling back to: nobody can make cold on demand. So he does what doctors of the era did — hangs baskets of ice from his patients' ceilings and lets it drip.

[explaining] The theory wasn't the problem. The ice was. It had to be cut from frozen lakes in New England, packed in sawdust, and shipped a thousand miles south by boat — which meant it was slowest, priciest, and least available exactly when a Florida summer needed it most.

[building] So Gorrie stopped waiting on shipments and built a machine to make his own. By 1844, he had a working prototype: a piston compressed air, the compressed air was allowed to expand and cool, and that cold air chilled brine around metal cans of water until they froze solid, on demand, in the middle of a Florida July. In 1851, the U.S. Patent Office granted him Patent No. 8080, for what the paperwork drily called an "improved process for the artificial production of ice."

[warm] A working, patented, government-recognized machine that made cold out of nothing. He had done the thing nobody else had managed.

[pause] [flat] It didn't matter. That same year, his financial backer died suddenly, and the money vanished with him. [wary] Gorrie suspected — though he could never prove it — that the country's dominant natural-ice dealers, an industry built on shipping frozen lake water down the Eastern seaboard, had quietly worked to turn opinion against him. [bitter] Whatever the real cause, the press did the rest. One New York paper mocked him outright, warning readers about "this crank in Apalachicola who thinks he can make ice as good as the Lord Almighty." Investors read it and disappeared.

[heavy] Gorrie spent his final years crossing the South chasing funding that never came, sued by a debt collector for money he didn't have, his health and his reputation collapsing together. He died in 1855. Fifty-one years old, broke, in the same small town where it all started.

[quiet] He never once saw his idea taken seriously in his own lifetime."""

def process_text(text):
    # 1. Phonetic dictionary
    pronunciation_map = [
        (r'\bdrily called an improved\b', 'officially called: an improved'),
        (r'\bdrily called\b', 'officially called'),
        (r'\bpriciest\b', 'most expensive'),
        (r'\bJohn Gorrie\b', 'John Gore-ee'),
        (r'\bGorrie\b', 'Gore-ee'),
        (r'\bApalachicola\b', 'Ap-uh-latch-ih-CO-luh'),
        (r'\bInvestors read it and disappeared\b', 'Investors read the report, and disappeared'),
        (r'\bInvestors read it\b', 'Investors read the report'),
        (r'\bHis credit disappeared\b', 'His financial credit disappeared'),
        (r'\bPatent No\.\s*8080\b', 'Patent Number 80-80'),
        (r'\bPatent No\.\b', 'Patent Number'),
    ]
    for pattern, repl in pronunciation_map:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # 2. Convert bare [pause] to [pause: 1.2s]
    text = re.sub(r'\[pause\]', '[pause: 1.2s]', text, flags=re.IGNORECASE)

    # 3. Strip stage directions like [narrating, low], [building], [measured], [flat], [weighty], etc.
    text = re.sub(r'\[(?!pause:\s*[\d.]+s?\])[^\]]+\]', '', text)
    text = re.sub(r'[ \t]+', ' ', text).strip()

    # 4. Protect abbreviations
    protected_text = re.sub(
        r'\b(D\.C\.|U\.S\.|Mr\.|Mrs\.|Dr\.|St\.|i\.e\.|e\.g\.)',
        lambda m: m.group(1).replace('.', '@@DOT@@'),
        text
    )

    # 5. Split on paragraph / newlines first to honor paragraph breaks
    paragraphs = [p.strip() for p in protected_text.split('\n') if p.strip()]
    
    units = []
    for para in paragraphs:
        # Check if entire paragraph starts or contains pause
        raw_segs = [s.strip().replace('@@DOT@@', '.') for s in re.split(r'(?<=[.!?])\s+', para) if s.strip()]
        
        curr_segment = ''
        for s in raw_segs:
            if not curr_segment:
                curr_segment = s
            else:
                if len(curr_segment.split()) < 12 or len(s.split()) < 6:
                    curr_segment += ' ' + s
                else:
                    units.append(curr_segment)
                    curr_segment = s
        if curr_segment:
            units.append(curr_segment)

    # Extract pauses from units
    final_units = []
    for u in units:
        pause_match = re.search(r'\[pause:\s*([\d.]+)s?\]', u)
        if pause_match:
            pval = float(pause_match.group(1))
            clean_u = re.sub(r'\[pause:\s*[\d.]+s?\]', '', u).strip()
            if clean_u:
                final_units.append((clean_u, pval))
        else:
            final_units.append((u, 0.75)) # default documentary breath pause

    return final_units

units = process_text(raw_script)
print(f"Total processed units: {len(units)}")
for idx, (t, p) in enumerate(units):
    print(f"Unit {idx+1} (pause after: {p}s): {t[:80]}...")
