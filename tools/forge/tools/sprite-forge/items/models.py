"""Every item model by the name the item table gives it (src/systems/itemArt/itemArtTable.js ITEM_ART, as
tools/sprite-forge/specs/items.json carries it). A model is `fn(item, words, seed)`: it adds its parts to `item`
(kit.Item) in metres, z up, the eye before it looking down at kit.ELEVATION, and draws nothing itself. Its words are
the row's; `seed` is the template index unless the words name one, so two rows never build one mesh."""

MODELS = {}


def model(fn):
    """Register `fn` under its own name."""
    if fn.__name__ in MODELS:
        raise ValueError(f'item models: "{fn.__name__}" twice')
    MODELS[fn.__name__] = fn
    return fn


def load_all():
    """Import every module of models, so each registers."""
    from . import (coffer, fish, food, foraging, gather, gems, goods, hides, materials, nodeplants, nodes,  # noqa: F401
                   papers, particles, quiver, standins, survival, torches, trinkets)
    return MODELS
