"""The beast forge's surfaces: a creature's hide, fur, scale, stone or wood as Daggerfall's renders show them - one
colour shading softly from dark to light over a broad mottle and a fine grain, and a relief fine enough that the light
breaks on it a pixel at a time. Every pattern is read from the mesh's rest place, so it stays put as the creature
moves. The colours sit on one ramp, so a fitted tint (materials.tint) reaches every shade."""
import materials


def _noise(nt, vec, scale, detail, roughness=0.5):
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    nz.inputs['Roughness'].default_value = roughness
    nt.links.new(vec, nz.inputs['Vector'])
    return nz.outputs['Fac']


def hide(name, dark, light, mottle=6.0, grain=55.0, grain_share=0.3, relief=0.3, relief_scale=60.0, rough=0.6,
         spec=0.35, metal=0.0, soft=0.22, stretch=(1.0, 1.0, 1.0)):
    """A surface shading from `dark` to `light`: a broad mottle `mottle` waves a metre, a fine grain `grain` a metre
    taking `grain_share` of the pattern, the ramp between them `soft` wide either side of its middle (a hard ramp
    blotches); and a relief of `relief_scale` bumps a metre, `relief` strong. `stretch` squeezes the pattern's waves
    along each rest axis (below 1 draws them out): fur streaks from front to back at (1, 0.35, 1)."""
    m, b = materials._principled(name, dark, metal=metal, rough=rough, spec=spec)
    nt = m.node_tree
    vec = materials._coords(m, stretch)
    broad, fine = _noise(nt, vec, mottle, 2.0), _noise(nt, vec, grain, 1.0)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = grain_share
    nt.links.new(broad, mix.inputs['A'])
    nt.links.new(fine, mix.inputs['B'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.5 - soft, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.5 + soft, (*light, 1)
    nt.links.new(mix.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    if relief > 0:
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = relief
        bump.inputs['Distance'].default_value = 0.004
        nt.links.new(_noise(nt, vec, relief_scale, 4.0, 0.6), bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def _ramp(nt, fac, dark, light, soft):
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.5 - soft, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.5 + soft, (*light, 1)
    nt.links.new(fac, ramp.inputs['Fac'])
    return ramp.outputs['Color']


def two_sided(name, top, under, mottle=6.0, grain=40.0, grain_share=0.3, soft=0.22, rough=0.6, spec=0.3,
              veins=0.0, vein_scale=9.0, vein_width=0.06):
    """A membrane or a vane seen from both sides: `top` (dark, light) where the camera meets the side its faces face,
    `under` (dark, light) from the other (Wing `faces_up`), each shading softly as `hide` does. `veins` darkens a net of
    cells `vein_scale` a metre across along their edges by that share."""
    m, b = materials._principled(name, top[0], rough=rough, spec=spec)
    nt = m.node_tree
    vec = materials._rest(nt)
    broad, fine = _noise(nt, vec, mottle, 2.0), _noise(nt, vec, grain, 1.0)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = grain_share
    nt.links.new(broad, mix.inputs['A'])
    nt.links.new(fine, mix.inputs['B'])
    side = nt.nodes.new('ShaderNodeMix')
    side.data_type = 'RGBA'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(geo.outputs['Backfacing'], side.inputs['Factor'])
    nt.links.new(_ramp(nt, mix.outputs['Result'], *top, soft), side.inputs['A'])
    nt.links.new(_ramp(nt, mix.outputs['Result'], *under, soft), side.inputs['B'])
    colour = side.outputs['Result']
    if veins > 0:
        cells = nt.nodes.new('ShaderNodeTexVoronoi')
        cells.feature = 'DISTANCE_TO_EDGE'
        cells.inputs['Scale'].default_value = vein_scale
        nt.links.new(vec, cells.inputs['Vector'])
        edge = nt.nodes.new('ShaderNodeMapRange')
        edge.inputs['From Min'].default_value, edge.inputs['From Max'].default_value = 0.0, vein_width
        edge.inputs['To Min'].default_value, edge.inputs['To Max'].default_value = 1.0 - veins, 1.0
        nt.links.new(cells.outputs['Distance'], edge.inputs['Value'])
        dim = nt.nodes.new('ShaderNodeMix')
        dim.data_type = 'RGBA'
        dim.blend_type = 'MULTIPLY'
        dim.inputs['Factor'].default_value = 1.0
        nt.links.new(colour, dim.inputs['A'])
        nt.links.new(edge.outputs['Result'], dim.inputs['B'])
        colour = dim.outputs['Result']
    nt.links.new(colour, b.inputs['Base Color'])
    return m


def spotted(name, base, dots, band=None, band_at=(0.0, 0.0), mottle=6.0, soft=0.22, spots=18.0, size=0.25,
            share=0.5, rough=0.35, spec=0.6):
    """A hide (`base` dark, light, softly mottled) strewn with round spots of colour `dots`: one in a `share` of the
    cells of a net `spots` a metre across, `size` of a cell wide. `band` (dark, light) takes over above the rest height
    `band_at` (from, to), blended between them: a pale back."""
    m, b = materials._principled(name, base[0], rough=rough, spec=spec)
    nt = m.node_tree
    vec = materials._rest(nt)
    broad = _noise(nt, vec, mottle, 2.0)
    colour = _ramp(nt, broad, *base, soft)
    if band is not None:
        xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(vec, xyz.inputs['Vector'])
        at = nt.nodes.new('ShaderNodeMapRange')
        at.interpolation_type = 'SMOOTHSTEP'
        at.inputs['From Min'].default_value, at.inputs['From Max'].default_value = band_at
        nt.links.new(xyz.outputs['Z'], at.inputs['Value'])
        colour = _mix(nt, colour, _ramp(nt, broad, *band, soft), at.outputs['Result'])
    cells = nt.nodes.new('ShaderNodeTexVoronoi')
    cells.inputs['Scale'].default_value = spots
    nt.links.new(vec, cells.inputs['Vector'])
    edge = nt.nodes.new('ShaderNodeMapRange')   # 1 inside a spot, falling to 0 over its rim
    edge.inputs['From Min'].default_value, edge.inputs['From Max'].default_value = size * 0.5, size * 0.35
    nt.links.new(cells.outputs['Distance'], edge.inputs['Value'])
    pick = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(cells.outputs['Color'], pick.inputs['Color'])
    keep = nt.nodes.new('ShaderNodeMath')
    keep.operation = 'GREATER_THAN'
    keep.inputs[1].default_value = 1.0 - share
    nt.links.new(pick.outputs['Red'], keep.inputs[0])
    spot = nt.nodes.new('ShaderNodeMath')
    spot.operation = 'MULTIPLY'
    nt.links.new(edge.outputs['Result'], spot.inputs[0])
    nt.links.new(keep.outputs['Value'], spot.inputs[1])
    colour = _mix(nt, colour, _ramp(nt, broad, dots, dots, soft), spot.outputs['Value'])
    nt.links.new(colour, b.inputs['Base Color'])
    return m


def _mix(nt, a, b, fac):
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(fac, mix.inputs['Factor'])
    nt.links.new(a, mix.inputs['A'])
    nt.links.new(b, mix.inputs['B'])
    return mix.outputs['Result']


def grooved(name, dark, light, groove, bands=6.5, share=0.15, distortion=4.0, mottle=6.0, soft=0.22, rough=0.9,
            spec=0.2):
    """A hide (`dark`, `light`) cut by crooked dark grooves of colour `groove` across its height, `bands` a metre,
    together taking `share` of the surface: wood's bark."""
    m, b = materials._principled(name, dark, rough=rough, spec=spec)
    nt = m.node_tree
    vec = materials._rest(nt)
    colour = _ramp(nt, _noise(nt, vec, mottle, 2.0), dark, light, soft)
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = bands
    wave.inputs['Distortion'].default_value = distortion
    nt.links.new(vec, wave.inputs['Vector'])
    cut = nt.nodes.new('ShaderNodeMapRange')   # 1 in the groove (the wave's lowest share), 0 elsewhere
    cut.inputs['From Min'].default_value, cut.inputs['From Max'].default_value = share, share * 0.6
    nt.links.new(wave.outputs['Fac'], cut.inputs['Value'])
    colour = _mix(nt, colour, _ramp(nt, wave.outputs['Fac'], groove, groove, soft), cut.outputs['Result'])
    nt.links.new(colour, b.inputs['Base Color'])
    return m
