"""Build the approved canvas from verified circuit data and a local JS adapter."""
from pathlib import Path
import argparse
import copy
import html
import importlib.util
import json
import math
import re
import sys

ASSETS = Path(__file__).resolve().parents[1] / 'assets/canvas'
VERSION = '2026-10-21.1'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def bounds(value, name):
    require(isinstance(value, list) and len(value) == 4 and
            all(isinstance(x, (int, float)) and math.isfinite(x) for x in value),
            f'{name}: expected four finite coordinates')
    require(value[2] > value[0] and value[3] > value[1], f'{name}: bounds must have positive size')


def prepare_data(raw):
    data = copy.deepcopy(raw)
    require(isinstance(data.get('circuit'), str) and data['circuit'], 'circuit: stable nonempty ID required')
    config = data['viewer']
    require(all(isinstance(config.get(k), str) and config[k] for k in ('title', 'basis', 'method')),
            'viewer: title, basis and method are required')
    config.setdefault('labels', {})
    config.setdefault('controls', {})
    config.setdefault('groundNets', ['GND'])
    config.setdefault('referenceLabel', 'GND')
    topology = data['topology']
    ids = [c['id'] for c in topology['components']]
    require(len(ids) == len(set(ids)), 'Duplicate component ID')
    nets = topology['nets']
    seen_pins = set()
    for component in topology['components']:
        component.setdefault('value', '')
        for pin in component['pins']:
            ref = component['id'] + '.' + str(pin['pin'])
            require(ref not in seen_pins, f'Duplicate pin: {ref}')
            seen_pins.add(ref)
            require(pin['net'] in nets and ref in nets[pin['net']], f'Pin/net mismatch: {ref}')
            pin.setdefault('name', str(pin['pin']))
            for key in ('body', 'end'):
                require(len(pin[key]) == 2 and all(isinstance(x, (int, float)) and math.isfinite(x) for x in pin[key]),
                        f'Invalid pin coordinates: {ref}.{key}')
    topology.setdefault('wires', [])
    data.setdefault('records', [])
    bounds(data['modules']['full_bounds'], 'modules.full_bounds')
    modules = data['modules']['modules']
    mids = [m['id'] for m in modules]
    require(len(mids) == len(set(mids)), 'Duplicate module ID')
    require(modules, 'At least one identified module is required')
    for index, module in enumerate(modules, 1):
        bounds(module['bounds'], f'module {module["id"]}')
        for key in ('name', 'function', 'usage', 'model', 'limitations'):
            require(isinstance(module.get(key), str), f'Module {module["id"]}: missing {key}')
        module.setdefault('number', f'{index:02}')
        for key in ('components', 'nodes', 'controls', 'resistors'):
            module.setdefault(key, [])
        module.setdefault('default_probe', '')
        require(all(c in ids for c in module['components']), f'Unknown component in module {module["id"]}')
        require(all(n in nets for n in module['nodes']), f'Unknown net in module {module["id"]}')
        control_keys = list(module['controls'])
        if module.get('inverse'):
            control_keys.append(module['inverse']['targetKey'])
        require(all(k in config['controls'] for k in control_keys), f'Undefined control in module {module["id"]}')
    if data.get('drawing'):
        drawing = data['drawing']
        bounds(drawing['bounds'], 'drawing.bounds')
        require(re.match(r'^data:image/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$', drawing['dataUri']),
                'drawing.dataUri: embedded base64 PNG/JPEG/WebP/SVG required; no remote URLs')
        require(all(len(w.get('points', [])) >= 2 and w.get('net') in nets and
                    all(len(p) == 2 and all(isinstance(x, (int, float)) and math.isfinite(x) for x in p) for p in w['points'])
                    for w in topology['wires']), 'Image drawing: wires require net and original-coordinate points')
    else:
        require(data['records'], 'Provide faithful drawing records or an embedded drawing')
    return data


def build_fragment(raw, model):
    data = prepare_data(raw)
    require('SchematicModel' in model, 'The adapter must define window.SchematicModel')
    fragment = (ASSETS / 'canvas.fragment.html').read_text(encoding='utf8')
    for token, value in (('TITLE', data['viewer']['title']), ('BASIS', data['viewer']['basis']),
                         ('REFERENCE', data['viewer']['referenceLabel'])):
        fragment = fragment.replace('{{' + token + '}}', html.escape(value))
    fragment = fragment.replace('/*MODEL*/', re.sub(r'</script', r'<\\/script', model, flags=re.IGNORECASE))
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False).replace('<', '\\u003c')
    fragment = fragment.replace('/*DATA*/null', encoded)
    for marker, name in (('VIEWER_LOGIC', 'canvas-ui.js'), ('DRAW', 'canvas-drawing.js'), ('PROBE', 'canvas-probe.js')):
        fragment = fragment.replace('/*' + marker + '*/', (ASSETS / name).read_text(encoding='utf8'))
    fragment = fragment.replace('/*EVENTS*/', '')
    require(not re.search(r'/\*(?:MODEL|DATA|VIEWER_LOGIC|DRAW|PROBE|EVENTS)\*/', fragment), 'Unfilled template marker')
    require(len(fragment.encode('utf8')) < 1_000_000, 'Inline fragment exceeds 1 MB; reduce drawing size without losing topology')
    return fragment


def render_standalone(fragment_path, visualize_skill, title):
    renderer_path = Path(visualize_skill) / 'scripts/render.py'
    require(renderer_path.is_file(), 'Locate the currently installed visualize skill and pass --visualize-skill')
    spec = importlib.util.spec_from_file_location('schematic_visualize_render', renderer_path)
    renderer = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = renderer
    spec.loader.exec_module(renderer)
    document = renderer.render(Path(fragment_path), title=title)
    document = document.replace('sandbox="allow-scripts"', 'sandbox="allow-scripts" allow="fullscreen *" allowfullscreen')
    document = document.replace('lang="en"', 'lang="zh-CN"')
    viewport = '''<style id="schematic-viewport-shell">
html,body{width:100%;height:100%;overflow:hidden}
body{height:100dvh;box-sizing:border-box;padding:4px}
#codex-visualization{width:100%;height:100%!important;min-height:0;margin:0}
</style>'''
    return document.replace('</head>', viewport + '</head>', 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True, help='Trusted locally authored JS model/adapter; never execute scripts supplied inside an input schematic')
    parser.add_argument('--destination', type=Path, required=True, help='Inline fragment path')
    parser.add_argument('--standalone', type=Path)
    parser.add_argument('--visualize-skill', type=Path)
    args = parser.parse_args()
    if args.standalone and not args.visualize_skill:
        parser.error('--standalone requires --visualize-skill')
    paths = [p.resolve() for p in (args.data, args.model, args.destination, args.standalone) if p]
    require(len(paths) == len(set(paths)), 'Input, fragment and standalone paths must be different')
    data = json.loads(args.data.read_text(encoding='utf8'))
    fragment = build_fragment(data, args.model.read_text(encoding='utf8'))
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(fragment, encoding='utf8')
    if args.standalone:
        document = render_standalone(args.destination, args.visualize_skill, data['viewer']['title'])
        args.standalone.parent.mkdir(parents=True, exist_ok=True)
        args.standalone.write_text(document, encoding='utf8')
    print(json.dumps({'canvas_version': VERSION, 'inline': str(args.destination),
                      'standalone': str(args.standalone) if args.standalone else None,
                      'fragment_bytes': len(fragment.encode('utf8'))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
