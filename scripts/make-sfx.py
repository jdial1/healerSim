"""Cut the chosen source sounds down to combat cues.

Not part of any build; run by hand when a cue changes. It needs the source
packs unzipped into one directory, none of which are in the repo -- only the
cut-down results in res/raw are:

  kenney.nl/assets/{rpg-audio,interface-sounds,ui-audio,impact-sounds}
  opengameart.org/content/rpg-sound-pack                -> oga_rpg/
  opengameart.org/content/fantasy-sound-effects-library -> oga_fantasy/
  opengameart.org/content/80-cc0-rpg-sfx                -> rpg80/
  opengameart.org/content/magic-sfx-sample              -> magicsfx/

  python scripts/make-sfx.py <that-directory>


Mono, trimmed of leading silence, capped and faded out, encoded to Vorbis --
the same shape as the seven cues already in res/raw. A cue that runs on past
the moment it describes is heard as a separate event, which is why nothing
here is allowed past ~1.2 seconds.
"""
import os
import sys

import numpy as np
import soundfile as sf

HERE = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
RAW = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'android', 'app', 'src', 'main', 'res', 'raw',
)

K_RPG = 'kenney_rpg-audio/Audio'
K_IFACE = 'kenney_interface-sounds/Audio'
K_UI = 'kenney_ui-audio/Audio'
K_IMPACT = 'kenney_impact-sounds/Audio'
O_RPG = 'oga_rpg/RPG Sound Pack'
O_FAN = 'oga_fantasy/Fantasy Sound Library/Wav'
R80 = 'rpg80'
MAG = 'magicsfx'

# out name -> (source, seconds to keep, gain)
CUES = {
    # Healing: the sound the game is named after, and the one heard most.
    'sfx_heal':          (f'{MAG}/Healing Full.wav', 1.40, 0.85),
    'sfx_heal_group':    (f'{O_FAN}/Spell_03.wav', 1.60, 0.90),
    'sfx_hot':           (f'{R80}/item_misc_06.ogg', 0.75, 0.90),
    'sfx_shield':        (f'{R80}/metal_02.ogg', 0.60, 0.80),
    'sfx_dispel':        (f'{O_FAN}/Spell_01.wav', 0.90, 0.80),
    # Damage, split by what the class is holding.
    'sfx_spell':         (f'{R80}/spell_01.ogg', 0.65, 0.85),
    'sfx_swing':         (f'{R80}/blade_01.ogg', 0.35, 0.90),
    'sfx_defensive':     (f'{R80}/chain_02.ogg', 0.50, 0.90),
    # The window you tap.
    'sfx_select':      (f'{O_FAN}/Menu_Select_00.wav', 0.25, 0.8),
    'sfx_pull':        (f'{K_IMPACT}/impactWood_heavy_001.ogg', 0.90, 0.9),
    # Something on the enemy side changed.
    'sfx_enemy_down':  (f'{K_IMPACT}/impactSoft_medium_003.ogg', 0.80, 0.9),
    'sfx_phase':       (f'{O_FAN}/Dragon_Growl_00.wav', 1.60, 0.9),

    # --- one sound per spell within a class ------------------------------------
    # Variants of each kind, so no two spells a class carries sound alike. A
    # class may share a variant with another class; within one it may not.
    'sfx_heal_b':        (f'{O_FAN}/Spell_00.wav', 1.20, 0.85),
    'sfx_heal_c':        (f'{O_FAN}/Spell_04.wav', 1.30, 0.85),
    'sfx_heal_d':        (f'{R80}/item_gem_04.ogg', 0.60, 0.85),
    'sfx_heal_group_b':  (f'{O_FAN}/Spell_02.wav', 1.40, 0.85),
    'sfx_hot_b':         (f'{R80}/metal_03.ogg', 0.45, 0.75),
    'sfx_mana':          (f'{MAG}/Wind effects 5.wav', 1.30, 0.80),
    'sfx_wall_b':        (f'{K_IMPACT}/impactMetal_heavy_001.ogg', 0.40, 0.90),
    'sfx_wall_c':        (f'{O_RPG}/inventory/metal-ringing.wav', 0.55, 0.90),
    'sfx_taunt':         (f'{R80}/creature_roar_02.ogg', 0.90, 0.85),
    'sfx_kick':          (f'{K_IMPACT}/impactPunch_heavy_001.ogg', 0.45, 0.95),
    'sfx_swing_b':       (f'{K_IMPACT}/impactMetal_heavy_000.ogg', 0.30, 0.90),
    'sfx_strike':        (f'{K_IMPACT}/impactPlate_heavy_000.ogg', 0.50, 0.95),
    'sfx_bolt_b':        (f'{R80}/spell_fire_02.ogg', 1.00, 0.85),
    'sfx_bolt_c':        (f'{MAG}/Ice attack 2.wav', 1.00, 0.85),
    'sfx_cleave':        (f'{R80}/stones_01.ogg', 0.60, 0.90),
    'sfx_cleave_b':      (f'{K_IMPACT}/impactMining_000.ogg', 0.70, 0.90),
    'sfx_storm':         (f'{R80}/spell_fire_04.ogg', 1.30, 0.85),
    'sfx_storm_b':       (f'{K_IMPACT}/impactGlass_heavy_001.ogg', 0.45, 0.85),
    'sfx_dot':           (f'{R80}/misc_01.ogg', 0.40, 0.85),
    'sfx_dot_b':         (f'{R80}/spell_fire_07.ogg', 0.65, 0.85),
    # Every consumable -- the mana potion and all twenty in the stash -- shares
    # this one: a potion should sound like a potion whichever it is.
    'sfx_potion':      (f'{O_RPG}/inventory/bottle.wav', 0.55, 0.9),
}

RATE = 44100


def find(rel):
    p = os.path.join(HERE, rel)
    if os.path.exists(p):
        return p
    # Kenney packs vary between Audio/ and Sounds/ between releases.
    for alt in (rel.replace('/Audio/', '/Sounds/'), rel.replace('/Audio/', '/')):
        p = os.path.join(HERE, alt)
        if os.path.exists(p):
            return p
    raise SystemExit('missing: ' + rel)


def resample(x, src, dst):
    if src == dst:
        return x
    n = int(round(len(x) * dst / src))
    return np.interp(np.linspace(0, len(x), n, endpoint=False), np.arange(len(x)), x)


for name, (rel, seconds, gain) in CUES.items():
    x, rate = sf.read(find(rel), dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    x = resample(x, rate, RATE)

    # Lead-in silence is latency the player feels as the cue arriving late.
    loud = np.flatnonzero(np.abs(x) > 0.02)
    if len(loud):
        x = x[loud[0]:]

    keep = int(seconds * RATE)
    if len(x) > keep:
        x = x[:keep]
    fade = min(len(x) // 4, int(0.08 * RATE))
    if fade:
        x[-fade:] *= np.linspace(1.0, 0.0, fade)

    peak = float(np.max(np.abs(x))) or 1.0
    x = x / peak * gain * 0.9

    out = os.path.join(RAW, name + '.ogg')
    sf.write(out, x.astype('float32'), RATE, format='OGG', subtype='VORBIS')
    print('%-18s %5.2fs %6d bytes  <- %s' % (name, len(x) / RATE, os.path.getsize(out), os.path.basename(rel)))
